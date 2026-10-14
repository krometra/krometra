FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.mjs ./
COPY remote ./remote

USER node
EXPOSE 8787
CMD ["node", "remote-server.mjs"]
