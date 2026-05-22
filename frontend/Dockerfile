FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
# 用国内 npm 镜像加速 (CN-friendly); 海外构建可 --build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm install --no-audit --no-fund --registry=${NPM_REGISTRY}

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.mjs ./
EXPOSE 3000
CMD ["npm", "start"]
