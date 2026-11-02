# Smart Pantry API
FROM node:22-slim
# OpenSSL is needed by Prisma's migration engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000
# Apply any pending migrations, then start. Safe to run on every start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
