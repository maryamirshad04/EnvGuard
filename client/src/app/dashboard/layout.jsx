'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { DashboardContext } from '@/lib/DashboardContext';
import DashboardNavbar from '@/components/DashboardNavbar';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshCompanies = useCallback(async () => {
    const res = await api.companies.list();
    setCompanies(res.companies || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setUser(meRes.user);
        await refreshCompanies();
      } catch {
        router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router, refreshCompanies]);

  async function logout() {
    await api.logout();
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-sm text-mist">Verifying session</p>
      </main>
    );
  }

  return (
    <DashboardContext.Provider value={{ user, companies, refreshCompanies, logout }}>
      <div className="min-h-screen bg-ink">
        <DashboardNavbar />
        {children}
      </div>
    </DashboardContext.Provider>
  );
}
