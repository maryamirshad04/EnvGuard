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

        const projectsRes = await api.projects.list();
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

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      const { project } = await api.projects.create(newName.trim());
      setProjects((prev) => [project, ...prev]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-sm text-mist">Verifying session\u2026</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm text-signal">
            <img src="/leaf_and_lock.png" alt="" className="h-5 w-5" />
            envguard
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-mist">{user?.email}</span>
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
            <h1 className="text-2xl font-semibold text-paper">Your projects</h1>
            <p className="mt-1 text-sm text-mist">
              Every secret is encrypted at rest \u2014 organized by project and environment.
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
            >
              + New project
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
              placeholder="Project name, e.g. my-saas-app"
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

        {projects.length === 0 && !creating ? (
          <div className="mt-8 rounded-sm border border-dashed border-line p-10 text-center">
            <p className="font-mono text-sm text-mist">No projects yet.</p>
            <p className="mt-1 text-sm text-mist">
              Create one to start encrypting environment variables.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/${p.id}`}
                  className="block rounded-sm border border-line bg-surface p-5 transition-colors hover:border-signal/40"
                >
                  <p className="font-mono text-xs uppercase tracking-wider text-signal">Project</p>
                  <h3 className="mt-2 text-lg font-medium text-paper">{p.name}</h3>
                  <p className="mt-1 text-xs text-mist">
                    Created {new Date(p.created_at).toLocaleDateString()}
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
