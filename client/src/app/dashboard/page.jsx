'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setUser(meRes.user);

        const companiesRes = await api.companies.list();
        if (cancelled) return;
        setCompanies(companiesRes.companies || []);
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

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      const { company } = await api.companies.create(newName.trim());
      setCompanies((prev) => [company, ...prev]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-sm text-mist">Verifying session</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm text-signal">
            <img 
    src="/lock.svg" 
    alt="Envguard icon" 
    className="inline-block h-5 w-5 text-signal align-middle" 
  /> 
  <span className="align-middle">envguard</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-mist">{user?.email?.split('@')[0]}</span>
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-paper">Your companies</h1>
            <p className="mt-1 text-sm text-mist">
              Each workspace has its own team, projects, and encrypted variables.
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
            >
              + New company
            </button>
          )}
        </div>

        {creating && (
          <form
            onSubmit={handleCreate}
            className="mt-6 flex flex-col gap-3 rounded-sm border border-line bg-surface p-4 sm:flex-row sm:items-center"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Company name, e.g. Acme Inc"
              className="flex-1 rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName('');
                  setError('');
                }}
                className="text-sm text-mist hover:text-paper"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-alert">{error}</p>}

        {companies.length === 0 && !creating ? (
          <div className="mt-8 rounded-sm border border-dashed border-line p-10 text-center">
            <p className="font-mono text-sm text-mist">No companies yet.</p>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/${c.id}`}
                  className="block rounded-sm border border-line bg-surface p-5 transition-colors hover:border-signal/40"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs uppercase tracking-wider text-signal">Company</p>
                    <span
                      className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                        c.role === 'admin'
                          ? 'bg-signal/15 text-signal'
                          : 'border border-line text-mist'
                      }`}
                    >
                      {c.role}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-medium text-paper">{c.name}</h3>
                  <p className="mt-1 text-xs text-mist">
                    Created {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
