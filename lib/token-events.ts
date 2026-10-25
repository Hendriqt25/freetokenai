// Event global saat saldo/token habis. Dipakai chat & media untuk memunculkan
// popup klaim struk / minta admin top-up tanpa harus logout.
export const TOKENS_EXHAUSTED_EVENT = "ftai:tokens-exhausted";

export function notifyTokensExhausted() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOKENS_EXHAUSTED_EVENT));
}
