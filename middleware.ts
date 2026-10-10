import { NextRequest, NextResponse } from "next/server";
import { logReq, newRequestId } from "@/lib/obs";

// ponytail: NFR#5 — satu structured log ingress per request gateway /api/*
// (rid, method, path). Latency + hasil + ws menyusul di withTokens (satu
// choke point semua AI billing) — middleware tak bisa ukur durasi respons.
export function middleware(req: NextRequest) {
  const reqId = newRequestId();
  const res = NextResponse.next();
  res.headers.set("x-request-id", reqId);
  logReq({ reqId, endpoint: `${req.method} ${req.nextUrl.pathname}`, note: "gw" });
  return res;
}

export const config = { matcher: "/api/:path*" };
