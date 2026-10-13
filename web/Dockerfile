FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ARG VITE_DEFAULT_LOCALE=ru
ENV VITE_DEFAULT_LOCALE=$VITE_DEFAULT_LOCALE
RUN npm run build
RUN find dist/assets -type f \( -name '*.wasm' -o -name '*.js' -o -name '*.css' \) -exec gzip -9 -k {} \;

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-app.conf /etc/nginx/snippets/app.conf
COPY nginx-assets.conf /etc/nginx/snippets/assets.conf
COPY nginx-proxy.conf /etc/nginx/snippets/proxy.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
# Каталоги include'ов должны существовать всегда: без сертификата они пустые.
RUN mkdir -p /etc/nginx/ssl-vhost /etc/nginx/redirect /var/www/certbot
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
