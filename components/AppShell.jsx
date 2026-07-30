'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/authContext';

const NAV_ITEMS = [
  { href: '/map', label: 'Concession Map', roles: ['admin'] },
  { href: '/map-users', label: 'Wildlife Map', roles: ['admin', 'user', 'viewer'] },
  { href: '/admin', label: 'Submissions & Users', roles: ['admin'] },
  { href: '/reports', label: 'Reporting', roles: ['admin'] },
  { href: '/vehicles', label: 'Vehicle Tracker', roles: ['admin'] },
  { href: '/profile', label: 'Profile', roles: ['admin', 'user', 'viewer'] },
];

function initialsFromLabel(label) {
  if (!label) return '··';
  const t = String(label).trim();
  if (!t) return '··';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  const local = (t.includes('@') ? t.split('@')[0] : t).replace(/[^a-zA-Z0-9]/g, '');
  if (!local.length) return '··';
  return local.length === 1 ? (local + local).toUpperCase() : local.slice(0, 2).toUpperCase();
}

export default function AppShell({ title, children }) {
  const pathname = usePathname();
  const { user, profile, role, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = useMemo(() => NAV_ITEMS.filter((i) => !role || i.roles.includes(role)), [role]);
  const label =
    profile?.name ||
    user?.displayName ||
    profile?.email ||
    user?.email ||
    profile?.phone ||
    user?.phoneNumber ||
    'Account';

  return (
    <div className="flex min-h-screen">
      <aside
        className="w-44 flex-shrink-0 flex flex-col text-white/90"
        style={{ background: 'linear-gradient(180deg, var(--kpr-burgundy) 0%, var(--kpr-burgundy-dark) 100%)' }}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <Image src="/data/icons/KPR.svg" alt="KPR" width={30} height={30} />
          <span className="text-sm font-bold tracking-wide text-white">KPR</span>
        </div>
        <nav className="flex-1 flex flex-col gap-1 px-2">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2.5 text-sm leading-tight transition ${
                  active ? 'bg-white/10 shadow-[inset_3px_0_0_var(--kpr-gold)]' : 'hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <a
          href="https://jonobenjamin.github.io/KPR_PWA/"
          target="_blank"
          rel="noreferrer"
          className="mx-2 mb-4 mt-auto border-t border-white/10 px-3 pt-3.5 text-xs font-semibold"
          style={{ color: 'var(--kpr-gold)' }}
        >
          Open field PWA ↗
        </a>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center justify-between px-6 py-4 shadow-portal border-b-[3px]"
          style={{
            background: 'linear-gradient(135deg, var(--kpr-green) 0%, var(--kpr-burgundy) 100%)',
            borderBottomColor: 'var(--kpr-gold)',
          }}
        >
          <h1 className="text-white text-lg font-semibold tracking-tight">{title}</h1>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="h-9 w-9 rounded-full grid place-items-center text-white text-sm font-bold shadow-md"
              style={{ background: 'linear-gradient(145deg, var(--kpr-green-light), var(--kpr-green))' }}
            >
              {initialsFromLabel(label)}
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 kpr-card overflow-hidden z-50" onMouseLeave={() => setMenuOpen(false)}>
                <div className="px-4 py-3 text-xs text-portal-text-muted border-b border-portal-border truncate">{label}</div>
                <Link href="/profile" className="block px-4 py-2.5 text-sm hover:bg-portal-surface-muted" onClick={() => setMenuOpen(false)}>
                  Profile
                </Link>
                <button
                  onClick={() => signOut()}
                  className="block w-full text-left px-4 py-2.5 text-sm hover:bg-portal-surface-muted text-portal-danger"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 min-w-0">{children}</main>

        <footer className="px-6 py-3 text-xs text-portal-text-muted border-t border-portal-border bg-white">
          © {new Date().getFullYear()} Khwai Private Reserve Monitoring System | Developed by{' '}
          <a href="https://okavangowater.com" target="_blank" rel="noreferrer" className="font-semibold" style={{ color: 'var(--kpr-green)' }}>
            okavangowater.com
          </a>
        </footer>
      </div>
    </div>
  );
}
