#!/usr/bin/env bash
# Выпуск сертификата Let's Encrypt и включение HTTPS на проде.
#
# Идемпотентно: повторный запуск не перевыпускает валидный сертификат,
# а только досоздаёт конфиги nginx.
#
#   CERTBOT_EMAIL=admin@example.com /opt/cad-studio/scripts/enable-https.sh example.com www.example.com
set -euo pipefail

APP_DIR=/opt/cad-studio
COMPOSE="docker compose -f docker-compose.prod.yml"
EMAIL="${CERTBOT_EMAIL:?Задай CERTBOT_EMAIL: почта для уведомлений Let’s Encrypt}"

DOMAINS=("$@")
[ ${#DOMAINS[@]} -gt 0 ] || { echo "Использование: $0 <домен> [ещё домены]"; exit 1; }
PRIMARY="${DOMAINS[0]}"
for domain in "${DOMAINS[@]}"; do
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Недопустимое доменное имя: $domain" >&2; exit 1; }
done

cd "$APP_DIR"

echo "--- Проверяю, что http отвечает (ACME ходит по нему)"
curl -fsS "http://$PRIMARY/api/health" >/dev/null

echo "--- Запрашиваю сертификаты для: ${DOMAINS[*]}"
args=()
for d in "${DOMAINS[@]}"; do args+=(-d "$d"); done

# Два сертификата на одни и те же домены: ECDSA и RSA.
#
# Certbot по умолчанию выпускает ECDSA-ключ, и nginx с одним таким серёром
# предлагает только ECDSA-шифры. Клиент, который их не умеет (часть
# корпоративных прокси, антивирусные TLS-инспекторы, старые сборки Chrome и
# Windows), получает handshake failure и показывает
# ERR_SSL_VERSION_OR_CIPHER_MISMATCH — сайт «не открывается», хотя сервер жив.
# nginx умеет держать оба и отдаёт тот, который клиент поддерживает.
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  --keep-until-expiring --key-type ecdsa \
  --cert-name "$PRIMARY" \
  "${args[@]}"

$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  --keep-until-expiring --key-type rsa --rsa-key-size 2048 \
  --cert-name "$PRIMARY-rsa" \
  "${args[@]}"

echo "--- Включаю https-виртуалхост"
mkdir -p deploy/nginx/ssl-vhost deploy/nginx/redirect
rm -f deploy/nginx/ssl-vhost/alias-*.conf
cat > deploy/nginx/ssl-vhost/ssl.conf <<CONF
server {
    listen 443 ssl default_server;
    http2 on;
    server_name $PRIMARY;

    # Два сертификата: ECDSA для современных клиентов, RSA — для тех, кто
    # ECDSA не умеет (иначе у них ERR_SSL_VERSION_OR_CIPHER_MISMATCH).
    ssl_certificate     /etc/letsencrypt/live/$PRIMARY/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY/privkey.pem;
    ssl_certificate     /etc/letsencrypt/live/$PRIMARY-rsa/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY-rsa/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Продление ходит по https, если http отдал редирект: challenge нужен и здесь.
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    include /etc/nginx/snippets/app.conf;
}
CONF

for alias in "${DOMAINS[@]:1}"; do
  alias_file="${alias//./-}"
  cat > "deploy/nginx/ssl-vhost/alias-$alias_file.conf" <<CONF
server {
    listen 443 ssl;
    http2 on;
    server_name $alias;

    ssl_certificate     /etc/letsencrypt/live/$PRIMARY/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY/privkey.pem;
    ssl_certificate     /etc/letsencrypt/live/$PRIMARY-rsa/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY-rsa/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$PRIMARY\$request_uri;
    }
}
CONF
done

# Health остаётся на http: автодеплой проверяет localhost, который сертификат не покрывает.
# Запросы по IP и чужим именам тоже уводим на основной домен.
cat > deploy/nginx/redirect/https.conf <<CONF
set \$to_https 1;
if (\$uri ~ "^/(\\.well-known/acme-challenge/|api/health\$)") {
    set \$to_https 0;
}
if (\$to_https) {
    return 301 https://$PRIMARY\$request_uri;
}
CONF

echo "--- Перечитываю конфиг nginx"
$COMPOSE up -d web
sleep 2
$COMPOSE exec -T web nginx -t
# up -d не трогает уже запущенный контейнер: без reload nginx продолжает
# отдавать прежний сертификат и прежние виртуалхосты.
$COMPOSE exec -T web nginx -s reload
sleep 2

echo "--- Проверка"
curl -fsS "https://$PRIMARY/api/health"
echo

# Клиент без ECDSA обязан получить RSA-сертификат, а не handshake failure —
# именно так выглядел «сайт не открывается» у пользователей.
echo "--- Проверка RSA-клиента (без ECDSA-шифров)"
if echo | openssl s_client -connect "$PRIMARY:443" -servername "$PRIMARY" \
     -tls1_2 -cipher 'RSA:!ECDSA' 2>&1 | grep -q "Cipher is"; then
  echo "  ок: RSA-клиент обслуживается"
else
  echo "  ВНИМАНИЕ: RSA-клиент не смог подключиться" >&2
  exit 1
fi

echo "=== HTTPS включён для ${DOMAINS[*]}"
