'use client';

import AppShell from '@/components/AppShell';
import AndroidAppCard from '@/components/AndroidAppCard';
import { useRequireRole, useAuth } from '@/lib/authContext';
import { normalizeRole } from '@/lib/roles';

export default function DownloadPage() {
  const { authorized } = useRequireRole(['admin', 'guide', 'researcher']);
  const { role } = useAuth();
  const isAdmin = normalizeRole(role) === 'admin';

  if (!authorized) return null;

  return (
    <AppShell title="Download app">
      <div className="max-w-xl">
        <AndroidAppCard showUpload={isAdmin} />
      </div>
    </AppShell>
  );
}
