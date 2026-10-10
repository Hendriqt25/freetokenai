import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { redis } from "@/lib/redis";

// ponytail: liveness/readiness internal tanpa auth (NFR#5). Selalu 200 agar LB
// bisa baca body; status 'ok' hanya bila db+redis keduanya up, else 'degraded'.
export async function GET() {
  let db: "up" | "down" = "down";
  let redisState: "up" | "down" = "down";
  try {
    await sql`SELECT 1`;
    db = "up";
  } catch {
    // down — dilaporkan di body, bukan throw.
  }
  try {
    await redis.ping();
    redisState = "up";
  } catch {
    // down — dilaporkan di body.
  }
  const status = db === "up" && redisState === "up" ? "ok" : "degraded";
  return NextResponse.json({ status, db, redis: redisState });
}
