'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';

const ENV_COLORS = {
  development: 'bg-sky-400',
  staging: 'bg-amber-400',
  production: 'bg-alert',
};

function envDotColor(name) {
  return ENV_COLORS[name] || 'bg-mist';
}

function parseEnvText(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=');
      if (eq === -1) return null;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return key ? { key, value } : null;
    })
    .filter(Boolean);
}

function toEnvFormat(variables) {
  return variables.map((v) => `${v.key}=${v.value}`).join('\n');
}

function csvEscape(value) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsvFormat(variables) {
  const header = 'key,value,protected';
  const rows = variables.map((v) => `${csvEscape(v.key)},${csvEscape(v.value)},${v.is_secret}`);
  return [header, ...rows].join('\n');
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [notice, setNotice] = useState('');

  const [addEnvOpen, setAddEnvOpen] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');

  const [addVarOpen, setAddVarOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newIsSecret, setNewIsSecret] = useState(true);

  const [importIsSecret, setImportIsSecret] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const activeEnv = environments.find((e) => e.id === activeEnvId);

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
      setAddEnvOpen(false);
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
        newValue,
        newIsSecret
      );
      setVariables((prev) => {
        const withoutOld = prev.filter((v) => v.key !== variable.key);
        return [...withoutOld, variable].sort((a, b) => a.key.localeCompare(b.key));
      });
      setNewKey('');
      setNewValue('');
      setNewIsSecret(true);
      setAddVarOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleImport(e) {
  e.preventDefault();
  const parsed = parseEnvText(importText).map((v) => ({ ...v, is_secret: importIsSecret }));
  if (parsed.length === 0) {
    setError('No KEY=VALUE lines found to import');
    return;
  }
  setError('');
  try {
    const res = await api.companies.projects.importVariables(companyId, projectId, activeEnvId, parsed);
    const imported = res.variables || [];
    setVariables((prev) => {
      const importedKeys = new Set(imported.map((v) => v.key));
      const kept = prev.filter((v) => !importedKeys.has(v.key));
      return [...kept, ...imported].sort((a, b) => a.key.localeCompare(b.key));
    });
    setNotice(`Imported ${imported.length} variable${imported.length === 1 ? '' : 's'}`);
    setTimeout(() => setNotice(''), 3000);
    setImportText('');
    setImportIsSecret(true);
    setImportOpen(false);
  } catch (err) {
    setError(err.message);
  }
}
  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(file);
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

  async function handleCopyAll() {
    await navigator.clipboard.writeText(toEnvFormat(variables));
    setNotice('Copied all as .env format');
    setTimeout(() => setNotice(''), 2000);
  }

  function handleDownloadEnv() {
    downloadText(`${activeEnv?.name || 'env'}.env`, toEnvFormat(variables));
  }

  function handleDownloadCsv() {
    downloadText(`${activeEnv?.name || 'env'}.csv`, toCsvFormat(variables));
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-sm text-mist">Loading project</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/dashboard/${companyId}`} className="text-sm text-mist hover:text-paper">
        &larr; Back to company
      </Link>

      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-signal">Project</p>
      <h1 className="mt-2 text-2xl font-semibold text-paper">{project?.name}</h1>

      {/* Environment cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {environments.map((env) => (
          <button
            key={env.id}
            onClick={() => handleSwitchEnv(env.id)}
            className={`flex items-center gap-2 rounded-sm border p-3 text-left transition-colors ${
              activeEnvId === env.id
                ? 'border-signal bg-signal/10'
                : 'border-line bg-surface hover:border-signal/40'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${envDotColor(env.name)}`} />
            <span className="truncate font-mono text-xs uppercase tracking-wide text-paper">
              {env.name}
            </span>
          </button>
        ))}
        <button
          onClick={() => setAddEnvOpen(true)}
          className="rounded-sm border border-dashed border-line p-3 text-left text-xs text-mist hover:border-signal/40 hover:text-paper"
        >
          + environment
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-alert">{error}</p>}
      {notice && <p className="mt-4 text-sm text-signal">{notice}</p>}

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setAddVarOpen(true)}
          className="rounded-sm bg-signal px-3 py-1.5 text-xs font-medium text-ink hover:bg-signal/90"
        >
          + Add variable
        </button>
        <button
          onClick={() => setImportOpen(true)}
          className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
        >
          Import .env
        </button>
        <button
          onClick={handleCopyAll}
          disabled={variables.length === 0}
          className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper disabled:opacity-40"
        >
          Copy all
        </button>
        <button
          onClick={handleDownloadEnv}
          disabled={variables.length === 0}
          className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper disabled:opacity-40"
        >
          Download .env
        </button>
        <button
          onClick={handleDownloadCsv}
          disabled={variables.length === 0}
          className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper disabled:opacity-40"
        >
          Download CSV
        </button>
      </div>

      {/* Variables list */}
      <div className="mt-4">
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
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm text-paper">{v.key}</p>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                        v.is_secret ? 'border border-line text-mist' : 'bg-signal/15 text-signal'
                      }`}
                    >
                      {v.is_secret ? 'protected' : 'plain'}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-sm text-mist">
                    {!v.is_secret || revealed[v.id] ? v.value : '\u2022'.repeat(Math.min(v.value.length, 24))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {v.is_secret && (
                    <button
                      onClick={() => toggleReveal(v.id)}
                      className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
                    >
                      {revealed[v.id] ? 'Hide' : 'Reveal'}
                    </button>
                  )}
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

      {/* Add environment modal */}
      <Modal open={addEnvOpen} onClose={() => setAddEnvOpen(false)} title="New environment">
        <form onSubmit={handleAddEnvironment} className="space-y-3">
          <input
            autoFocus
            value={newEnvName}
            onChange={(e) => setNewEnvName(e.target.value)}
            placeholder="e.g. qa"
            className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          />
          <button className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90">
            Create
          </button>
        </form>
      </Modal>

      {/* Add variable modal */}
      <Modal open={addVarOpen} onClose={() => setAddVarOpen(false)} title="Add variable">
        <form onSubmit={handleAddVariable} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-mist">Key</label>
            <input
              autoFocus
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="DATABASE_URL"
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-signal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-mist">Value</label>
            <input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="postgres://..."
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-signal"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-mist">
            <input
              type="checkbox"
              checked={newIsSecret}
              onChange={(e) => setNewIsSecret(e.target.checked)}
              className="accent-signal"
            />
            Protected (masked by default, click to reveal)
          </label>
          <button className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90">
            Add variable
          </button>
        </form>
      </Modal>

      {/* Bulk import modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import .env">
        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-mist">Upload a file (optional)</label>
            <input
              type="file"
              accept=".env,.txt,text/plain"
              onChange={handleFileSelect}
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-xs text-mist file:mr-3 file:rounded-sm file:border-0 file:bg-signal file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
          </div>
          <p className="text-xs text-mist">
  Or paste KEY=VALUE lines below.
</p>
<textarea
  value={importText}
  onChange={(e) => setImportText(e.target.value)}
  rows={8}
  placeholder={'DATABASE_URL=postgres://...\nAPI_KEY=sk-...'}
  className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-xs text-paper outline-none focus:border-signal"
/>
<label className="flex items-center gap-2 text-xs text-mist">
  <input
    type="checkbox"
    checked={importIsSecret}
    onChange={(e) => setImportIsSecret(e.target.checked)}
    className="accent-signal"
  />
  Protect all imported values (masked by default, click to reveal)
</label>
<button className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90">
  Import
</button>
        </form>
      </Modal>
    </div>
  );
}