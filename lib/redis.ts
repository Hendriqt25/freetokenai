import Redis from "ioredis";

// ponytail: singleton via globalThis agar dev-reload Next.js tidak bikin koneksi baru.
const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
