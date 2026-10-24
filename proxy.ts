import { NextRequest, NextResponse } from "next/server";
import { logReq, newRequestId } from "@/lib/obs";

// ponytail: NFR#5 — satu structured log ingress per request gateway /api/*
// (rid, method, path). Latency + hasil + ws menyusul di withTokens (satu
// choke point semua AI billing) — proxy tak bisa ukur durasi respons.
// Header keamanan dipasang untuk semua route (bukan cuma /api/*).
// Next 16: konvensi `middleware` deprecated -> `proxy` (runtime nodejs).
export function proxy(req: NextRequest) {
  const reqId = newRequestId();
  const res = NextResponse.next();
  res.headers.set("x-request-id", reqId);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.nextUrl.pathname.startsWith("/api/")) {
    logReq({ reqId, endpoint: `${req.method} ${req.nextUrl.pathname}`, note: "gw" });
  }
  return res;
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
