import { redirect } from 'next/navigation';
import { getAdminServerSession } from '@/lib/auth';

export default async function Home() {
  const session = await getAdminServerSession();
  if (session?.user.role === 'kasir') redirect('/kasir');
  if (session?.user.role === 'super_admin') redirect('/admin');
  redirect('/dashboard');
}
