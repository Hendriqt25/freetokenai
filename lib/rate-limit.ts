import { redis } from "./redis";

// ponytail: fixed-window 60/menit via Redis INCR+EXPIRE (persisten restart).
// Redis down -> fallback in-memory + warning sekali (tetap layani, jangan 500).
const mem = new Map<string, { count: number; window: number }>();
let warned = false;

function memLimited(key: string, limit: number): boolean {
  const win = Math.floor(Date.now() / 60000);
  const h = mem.get(key);
  if (!h || h.window !== win) {
    mem.set(key, { count: 1, window: win });
    return false;
  }
  h.count += 1;
  return h.count > limit;
}

export async function rateLimited(key: string, limit = 60): Promise<boolean> {
  const win = Math.floor(Date.now() / 60000);
  try {
    const n = await redis.incr(`rl:${key}:${win}`);
    if (n === 1) await redis.expire(`rl:${key}:${win}`, 65);
    return n > limit;
  } catch {
    if (!warned) {
      warned = true;
      console.warn("[rate-limit] Redis down, fallback in-memory.");
    }
    return memLimited(key, limit);
  }
}
