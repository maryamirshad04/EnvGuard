'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setUser(meRes.user);

        const projectsRes = await api.projects();
        if (cancelled) return;
        setProjects(projectsRes.projects || []);
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
  }, [router]);

  async function handleLogout() {
    await api.logout();
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-sm text-mist">Verifying session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-mono text-sm text-signal">
            <img 
    src="/lock.svg" 
    alt="Envguard icon" 
    className="inline-block h-5 w-5 text-signal align-middle" 
  /> 
  <span className="align-middle">envguard</span>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={handleLogout}
              className="rounded-sm border border-line px-3 py-1.5 text-sm text-mist hover:border-signal/40 hover:text-paper"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-paper">Your projects</h1>
        <p className="mt-1 text-sm text-mist">
          Every secret here is stored encrypted the server never sees plaintext.
        </p>

        {projects.length === 0 ? (
          <div className="mt-8 rounded-sm border border-dashed border-line p-10 text-center">
            <p className="font-mono text-sm text-mist">No projects yet.</p>
            <p className="mt-1 text-sm text-mist">
              Create one to start encrypting environment variables.
            </p>
            <button className="mt-6 rounded-sm bg-signal px-5 py-2 text-sm font-medium text-ink hover:bg-signal/90">
              + New project
            </button>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {projects.map((p) => (
              <li key={p.id} className="rounded-sm border border-line bg-surface p-4 text-paper">
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
