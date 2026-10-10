// ponytail: satu util server-only untuk NFR#5 (structured log) + NFR#6 (retry 1x).
// Tanpa dep baru (tanpa pino/newrelic) — console.log JSON satu baris per request.
// Dipakai: middleware (rid + latency semua /api/*), billing.withTokens (ws + hasil),
// vioFetch + chat provider fetch (retry 1x transient).

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export function logReq(f: {
  reqId: string;
  workspaceId?: string | null;
  endpoint: string;
  latencyMs?: number;
  status?: number;
  ok?: boolean;
  note?: string;
}) {
  console.log(
    JSON.stringify({
      t: "req",
      ts: new Date().toISOString(),
      reqId: f.reqId,
      ws: f.workspaceId ?? undefined,
      endpoint: f.endpoint,
      latencyMs: f.latencyMs,
      status: f.status,
      ok: f.ok,
      note: f.note,
    }),
  );
}

// ponytail: transient = throw jaringan/timeout ATAU status 5xx. 4xx tak di-retry.
export function isTransientStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

// ponytail: fetch tepat 2x maks — coba sekali, ulangi 1x hanya bila transient.
// Body string aman dipakai ulang; pemanggil yang pegang NextResponse tetap sama.
export async function fetchRetryOnce(url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    res = await fetch(url, init);
    return res;
  }
  if (!res.ok && isTransientStatus(res.status)) {
    res = await fetch(url, init);
  }
  return res;
}
