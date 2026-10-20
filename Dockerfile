# =========================
# Builder
# =========================
FROM node:20-bullseye AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY swagger.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

RUN pnpm exec prisma generate

COPY . .
RUN pnpm build


# =========================
# Runtime
# =========================
FROM node:20-bullseye

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/swagger.yaml ./
COPY --from=builder /app/dist ./dist

EXPOSE 4321

CMD ["node", "dist/src/index.js"]
