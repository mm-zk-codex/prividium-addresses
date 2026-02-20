FROM node:20-alpine AS base
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY services/resolver/package.json services/resolver/package.json
COPY services/relayer-l1/package.json services/relayer-l1/package.json
COPY services/relayer-l2/package.json services/relayer-l2/package.json
COPY services/tools/package.json services/tools/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build-resolver
COPY . .
RUN pnpm --filter resolver... build
RUN pnpm --filter resolver --prod deploy /app

FROM deps AS build-relayer-l1
COPY . .
RUN pnpm --filter relayer-l1... build
RUN pnpm --filter relayer-l1 --prod deploy /app

FROM deps AS build-relayer-l2
COPY . .
RUN pnpm --filter relayer-l2... build
RUN pnpm --filter relayer-l2 --prod deploy /app

FROM deps AS build-tools
COPY . .
RUN pnpm --filter tools... build
RUN pnpm --filter tools --prod deploy /app

FROM deps AS build-web
ARG VITE_RESOLVER_URL=/api
ENV VITE_RESOLVER_URL=${VITE_RESOLVER_URL}
COPY . .
RUN pnpm --filter web... build

FROM node:20-alpine AS resolver
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=build-resolver --chown=app:app /app ./
USER app
CMD ["pnpm", "start"]

FROM node:20-alpine AS relayer-l1
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=build-relayer-l1 --chown=app:app /app ./
USER app
CMD ["pnpm", "start"]

FROM node:20-alpine AS relayer-l2
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=build-relayer-l2 --chown=app:app /app ./
USER app
CMD ["pnpm", "start"]

FROM node:20-alpine AS tools
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=build-tools --chown=app:app /app ./
USER app
CMD ["pnpm", "start"]

FROM nginx:1.27-alpine AS web
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /workspace/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
