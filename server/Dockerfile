FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 4000
CMD ["node", "dist/index.js"]
