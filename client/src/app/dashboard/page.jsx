'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDashboard } from '@/lib/DashboardContext';
import Modal from '@/components/Modal';

export default function DashboardPage() {
  const router = useRouter();
  const { companies, refreshCompanies } = useDashboard();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      const { company } = await api.companies.create(newName.trim());
      await refreshCompanies();
      setCreating(false);
      setNewName('');
      router.push(`/dashboard/${company.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-paper">Your companies</h1>
          <p className="mt-1 text-sm text-mist">
            Each workspace has its own team, projects, and encrypted variables.
          </p>
        </div>
        <button
          onClick={() => {
            setError('');
            setNewName('');
            setCreating(true);
          }}
          className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
        >
          + New company
        </button>
      </div>

      {companies.length === 0 ? (
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
                      c.role === 'admin' ? 'bg-signal/15 text-signal' : 'border border-line text-mist'
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

      <Modal open={creating} onClose={() => setCreating(false)} title="New company">
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Company name"
            className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          />
          {error && <p className="text-sm text-alert">{error}</p>}
          <button className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90">
            Create
          </button>
        </form>
      </Modal>
    </div>
  );
}