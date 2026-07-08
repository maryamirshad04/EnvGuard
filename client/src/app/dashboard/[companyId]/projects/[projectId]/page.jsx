'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ProjectDetailPage() {
  const { companyId, projectId } = useParams();
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [environments, setEnvironments] = useState([]);
  const [activeEnvId, setActiveEnvId] = useState(null);
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [varsLoading, setVarsLoading] = useState(false);
  const [error, setError] = useState('');

  const [addingEnv, setAddingEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const loadVariables = useCallback(
    async (envId) => {
      if (!envId) return;
      setVarsLoading(true);
      try {
        const res = await api.companies.projects.listVariables(companyId, projectId, envId);
        setVariables(res.variables || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setVarsLoading(false);
      }
    },
    [companyId, projectId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api.companies.projects.get(companyId, projectId);
        if (cancelled) return;
        setProject(res.project);
        setEnvironments(res.environments || []);
        const first = res.environments?.[0];
        if (first) {
          setActiveEnvId(first.id);
          await loadVariables(first.id);
        }
      } catch (err) {
        router.push(err.message?.toLowerCase().includes('not found') ? `/dashboard/${companyId}` : '/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId]);

  async function handleSwitchEnv(envId) {
    setActiveEnvId(envId);
    setRevealed({});
    setError('');
    await loadVariables(envId);
  }

  async function handleAddEnvironment(e) {
    e.preventDefault();
    if (!newEnvName.trim()) return;
    setError('');
    try {
      const { environment } = await api.companies.projects.createEnvironment(
        companyId,
        projectId,
        newEnvName.trim()
      );
      setEnvironments((prev) => [...prev, environment]);
      setNewEnvName('');
      setAddingEnv(false);
      await handleSwitchEnv(environment.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddVariable(e) {
    e.preventDefault();
    if (!newKey.trim() || !newValue) return;
    setError('');
    try {
      const { variable } = await api.companies.projects.upsertVariable(
        companyId,
        projectId,
        activeEnvId,
        newKey.trim(),
        newValue
      );
      setVariables((prev) => {
        const withoutOld = prev.filter((v) => v.key !== variable.key);
        return [...withoutOld, variable].sort((a, b) => a.key.localeCompare(b.key));
      });
      setNewKey('');
      setNewValue('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteVariable(varId) {
    try {
      await api.companies.projects.deleteVariable(companyId, projectId, activeEnvId, varId);
      setVariables((prev) => prev.filter((v) => v.id !== varId));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleReveal(varId) {
    setRevealed((prev) => ({ ...prev, [varId]: !prev[varId] }));
  }

  async function handleCopy(varId, value) {
    await navigator.clipboard.writeText(value);
    setCopiedId(varId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <p className="font-mono text-sm text-mist">Loading project</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/dashboard" className="flex items-center gap-2 font-mono text-sm text-signal">
            <img 
    src="/lock.svg" 
    alt="Envguard icon" 
    className="inline-block h-5 w-5 text-signal align-middle" 
  /> 
  <span className="align-middle">envguard</span>
          </Link>
          <Link href={`/dashboard/${companyId}`} className="text-sm text-mist hover:text-paper">
            &larr; Back to company
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-wider text-signal">Project</p>
        <h1 className="mt-2 text-2xl font-semibold text-paper">{project?.name}</h1>

        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-line pb-4">
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => handleSwitchEnv(env.id)}
              className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors ${
                activeEnvId === env.id
                  ? 'bg-signal text-ink'
                  : 'border border-line text-mist hover:border-signal/40 hover:text-paper'
              }`}
            >
              {env.name}
            </button>
          ))}

          {addingEnv ? (
            <form onSubmit={handleAddEnvironment} className="flex items-center gap-2">
              <input
                autoFocus
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="e.g. Testing"
                className="w-28 rounded-sm border border-line bg-surface px-2 py-1.5 text-xs text-paper outline-none focus:border-signal"
              />
              <button type="submit" className="text-xs text-signal hover:underline">
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingEnv(false)}
                className="text-xs text-mist hover:text-paper"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingEnv(true)}
              className="rounded-sm border border-dashed border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
            >
              + environment
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-alert">{error}</p>}

        <form
          onSubmit={handleAddVariable}
          className="mt-6 flex flex-col gap-3 rounded-sm border border-line bg-surface p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs text-mist">Key</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="DATABASE_URL"
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-signal"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-mist">Value</label>
            <input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="postgres://..."
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-signal"
            />
          </div>
          <button
            type="submit"
            className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
          >
            Add variable
          </button>
        </form>

        <div className="mt-6">
          {varsLoading ? (
            <p className="font-mono text-sm text-mist">Loading variables</p>
          ) : variables.length === 0 ? (
            <div className="rounded-sm border border-dashed border-line p-10 text-center">
              <p className="font-mono text-sm text-mist">No variables in this environment yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
              {variables.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-paper">{v.key}</p>
                    <p className="mt-1 truncate font-mono text-sm text-mist">
                      {revealed[v.id] ? v.value : '\u2022'.repeat(Math.min(v.value.length, 24))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => toggleReveal(v.id)}
                      className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
                    >
                      {revealed[v.id] ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      onClick={() => handleCopy(v.id, v.value)}
                      className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
                    >
                      {copiedId === v.id ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleDeleteVariable(v.id)}
                      className="rounded-sm border border-line px-3 py-1.5 text-xs text-alert hover:border-alert/60"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
