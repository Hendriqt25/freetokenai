// ponytail: satu sumber URL publik untuk link klaim / QR struk.
// Urutan: APP_BASE_URL (produksi, eksplisit) -> CLAIM_BASE_URL (nama lama)
// -> NEXT_PUBLIC_APP_URL -> header reverse-proxy -> origin request.
// Jangan hardcode domain: kasir bisa jalan di LAN/IP, bukan app.restoran.com.
export function publicBaseUrl(req: Request): string {
  const env = (process.env.APP_BASE_URL ?? process.env.CLAIM_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (env) return env;

  const url = new URL(req.url);
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto || "http"}://${host}`;
}

export function claimUrl(req: Request, code: string): string {
  return `${publicBaseUrl(req)}/claim?code=${encodeURIComponent(code)}`;
}
