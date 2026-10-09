// Data statis untuk UI slicing (Section 4.5 / 5.1 PRD).
// Nanti diganti fetch ke GET /api/v1/workspace, GET /api/v1/chat/sessions,
// dan data user dari sesi login — lihat Section 7.4 PRD.

export const mockUser = {
  name: "Taufik Ramadhani",
  phoneNumber: "0815-2265-0048",
  avatarUrl: null as string | null,
};

export const mockWorkspace = {
  tokenBalance: 1500,
  expiresAtLabel: "27 September",
};

export const suggestionCards = [
  {
    icon: "file" as const,
    title: "Ringkas Dokumen",
    description:
      "Ubah artikel, PDF, atau catatan panjang jadi poin penting dalam hitungan detik.",
  },
  {
    icon: "pen" as const,
    title: "Tulis & Kembangkan",
    description:
      "Bikin caption, email, atau draf tulisan — lengkap dengan beberapa pilihan nada.",
  },
  {
    icon: "help" as const,
    title: "Tanya Apa Saja",
    description:
      "Dari fakta sampai pertimbangan keputusan, dijawab langsung tanpa perlu menyaring hasil pencarian.",
  },
];
