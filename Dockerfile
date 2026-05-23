FROM node:24-slim

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @workspace/api-server run build

EXPOSE 10000

ENV PORT=10000
ENV NODE_ENV=production

CMD ["node", "artifacts/api-server/dist/index.mjs"]
