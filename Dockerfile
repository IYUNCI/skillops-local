FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY assets ./assets
COPY README.md DEPLOYMENT.md ./

EXPOSE 18765

CMD ["node", "dist/cli.js", "ui", "--host", "0.0.0.0", "--port", "18765"]
