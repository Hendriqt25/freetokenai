import { redirect } from 'next/navigation';
import { getAdminServerSession } from '@/lib/auth';
import ConsoleShell from '@/components/admin/ConsoleShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminServerSession();
  const user = session?.user;

  if (!user) redirect('/admin/login');
  if (user.role === 'kasir') redirect('/kasir');
  if (user.role !== 'super_admin') redirect('/dashboard');

  return (
    <ConsoleShell role="super_admin" name={user.name || 'Super Admin'} email={user.email ?? ''}>
      {children}
    </ConsoleShell>
  );
}
