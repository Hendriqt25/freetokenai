// ponytail: id user stabil per browser sampai auth asli datang (PRD 4.2).
// Saat login/claim jadi, ganti dengan id user dari sesi — semua key
// history (chat + media) di-scope ke id ini, jadi tiap user punya riwayat sendiri.
export function currentUserId(): string {
  if (typeof window === "undefined") return "server";
  let id: string | null = null;
  try {
    id = localStorage.getItem("ftai:user:id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("ftai:user:id", id);
    }
  } catch {
    id = "anon";
  }
  return id;
}
