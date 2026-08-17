# Render: dockerfilePath=./server/Dockerfile, dockerContext=./server (see render.yaml).
# Do not COPY files from repo root — they are outside this context.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts/run-marketplace-domain-sync.mjs ./scripts/run-marketplace-domain-sync.mjs
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 4000
CMD ["node", "dist/index.js"]
