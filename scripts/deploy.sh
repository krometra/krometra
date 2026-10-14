#!/usr/bin/env bash
set -euo pipefail

SSH_HOST="${1:-cad-vps}"
DOMAIN="${DOMAIN:-krometra.ru}"
SERVER_IP=$(ssh -G "$SSH_HOST" | awk '/^hostname /{print $2}')

echo "Deploying to $SSH_HOST ($SERVER_IP)..."

ssh "$SSH_HOST" "SERVER_IP=$SERVER_IP DOMAIN=$DOMAIN bash -s" <<'REMOTE'
set -euo pipefail

APP_DIR=/opt/cad-studio
# SSH с deploy-ключом сервера: по https git просит логин, пока репозиторий приватный.
REPO_URL=git@github.com:nia-sempai/krometra.git
BRANCH=master
COMPOSE="docker compose -f docker-compose.prod.yml"
WEB_PORT=5000
HEALTH_PORT=80

if ! docker compose version >/dev/null 2>&1; then
  echo "--- Installing docker compose v2 plugin"
  mkdir -p /usr/local/lib/docker/cli-plugins
  tmp=$(mktemp)
  curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" -o "$tmp"
  echo "383ce6698cd5d5bbf958d2c8489ed75094e34a77d340404d9f32c4ae9e12baf0  $tmp" | sha256sum -c -
  install -m 755 "$tmp" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f "$tmp"
fi

echo "--- Fetching code into $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "--- Creating production .env"
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  cat > .env <<ENV
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgresql+asyncpg://cadstudio:$POSTGRES_PASSWORD@postgres:5432/cadstudio
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=cadstudio-$(openssl rand -hex 6)
MINIO_SECRET_KEY=$(openssl rand -hex 24)
MINIO_BUCKET=cad-studio
MINIO_SECURE=false
JWT_SECRET=$(openssl rand -hex 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_BYTES=32
REFRESH_TOKEN_EXPIRE_DAYS=30
COOKIE_SECURE=true
CORS_ORIGINS=https://$DOMAIN
PUBLIC_URL=https://$DOMAIN
DEBUG=false
APP_NAME=Крометра
APP_VERSION=0.1.0
ENV
fi

# Существующий продовый .env создавался до переименования продукта.
if grep -q '^APP_NAME=CAD Studio$' .env; then
  sed -i 's/^APP_NAME=CAD Studio$/APP_NAME=Крометра/' .env
fi
if grep -q '^CORS_ORIGINS=https://cad-studio.ru$' .env; then
  sed -i "s|^CORS_ORIGINS=https://cad-studio.ru$|CORS_ORIGINS=https://$DOMAIN|" .env
fi

if ! grep -q '^PUBLIC_URL=' .env; then
  echo "PUBLIC_URL=https://$DOMAIN" >> .env
fi

for key in POSTGRES_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY JWT_SECRET; do
  if ! grep -q "^$key=." .env; then
    echo "!!! В .env нет $key — задайте его вручную перед деплоем" >&2
    exit 1
  fi
done
if grep -Eq "^(MINIO_SECRET_KEY=minioadmin|POSTGRES_PASSWORD=cadstudio)$" .env; then
  echo "!!! В .env стоят пароли по умолчанию — смените их перед деплоем" >&2
  exit 1
fi
if ! grep -q "^COOKIE_SECURE=true$" .env; then
  echo "!!! ВНИМАНИЕ: в .env не COOKIE_SECURE=true — refresh-cookie уйдёт и по http" >&2
fi

if [ -d /tmp/cad-studio ]; then
  echo "--- Retiring old /tmp/cad-studio deployment"
  (cd /tmp/cad-studio && docker-compose down) || true
  docker rm -f cad-studio-web cad-studio-app cad-studio-postgres cad-studio-redis cad-studio-minio 2>/dev/null || true
  rm -rf /tmp/cad-studio
fi

# MinIO убрал образы с Docker Hub и quay.io: закреплённый тег берём из локального latest той же версии.
MINIO_IMAGE=$($COMPOSE config --images | grep '^minio/minio:')
if ! docker image inspect "$MINIO_IMAGE" >/dev/null 2>&1 \
  && [ "$(docker image inspect -f '{{index .Config.Labels "release"}}' minio/minio:latest 2>/dev/null)" = "${MINIO_IMAGE#*:}" ]; then
  docker tag minio/minio:latest "$MINIO_IMAGE"
fi

echo "--- Building images"
$COMPOSE build

echo "--- Removing stuck app/web containers"
# Сорванное пересоздание оставляет мёртвый контейнер и его копию «<id>_cad-studio-app»,
# после чего compose падает с конфликтом имени.
for state in dead created exited; do
  docker ps -aq --filter "status=$state" --filter "name=cad-studio-(app|web)" | xargs -r docker rm -f
done

echo "--- Starting stack"
$COMPOSE up -d --remove-orphans

echo "--- Waiting for postgres"
for _ in $(seq 1 30); do
  $COMPOSE exec -T postgres pg_isready -U cadstudio >/dev/null 2>&1 </dev/null && break
  sleep 2
done

echo "--- Running migrations"
$COMPOSE exec -T app alembic upgrade head </dev/null

echo "--- Pruning dangling images"
docker image prune -f >/dev/null

echo "--- Health check"
sleep 3
curl -fsS "http://localhost:$HEALTH_PORT/api/health"
echo
echo "=== Deploy OK: https://$DOMAIN (http://$SERVER_IP:$WEB_PORT) ==="
REMOTE
