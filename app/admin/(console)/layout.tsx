import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import Link from 'next/link';
import { LayoutDashboard, Building2, ChevronLeft } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const user = session?.user;

  if (!user) {
    redirect('/admin/login');
  }
  if (user.role !== 'super_admin') {
    redirect('/dashboard');
  }

  const navItems = [
    { href: '/admin', label: 'Daftar Cafe', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex">
      <aside className="w-64 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h1 className="text-lg font-bold text-primary flex items-center gap-2">
            <LayoutDashboard size={20} />
            Super Admin
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 transition"
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
          <Link
            href="/dashboard"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            <ChevronLeft size={18} />
            <span>Kembali ke Dashboard</span>
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="lg:hidden bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold text-neutral-900 dark:text-white">Super Admin</h1>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}