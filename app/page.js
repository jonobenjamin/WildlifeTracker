'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

export default function RootRedirect() {
  const { user, role, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user || !role) {
      router.replace('/login');
    } else if (role === 'admin') {
      router.replace('/map');
    } else {
      router.replace('/map-users');
    }
  }, [ready, user, role, router]);

  return (
    <div className="min-h-screen grid place-items-center bg-portal-bg">
      <div className="h-10 w-10 rounded-full border-[3px] border-portal-border border-t-kpr-green-light animate-spin" />
    </div>
  );
}
