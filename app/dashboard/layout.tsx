import DashboardShell from "@/components/DashboardShell";

// Shell dipasang di layout (bukan di tiap page) supaya Sidebar, TopBar, dan
// status auth tidak remount setiap kali pindah menu — transisi jadi mulus.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
