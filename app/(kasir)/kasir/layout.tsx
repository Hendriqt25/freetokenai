import KasirShell from "@/components/kasir/KasirShell";

export default function KasirLayout({ children }: { children: React.ReactNode }) {
  return <KasirShell>{children}</KasirShell>;
}
