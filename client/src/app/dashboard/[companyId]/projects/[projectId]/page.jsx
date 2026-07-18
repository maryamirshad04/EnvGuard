'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import Pagination from '@/components/Pagination';
import { ProjectSkeleton } from '@/components/Skeleton';

const ENV_COLORS = {
  development: 'bg-sky-400',
  staging: 'bg-amber-400',
  production: 'bg-alert',
};

const VARS_PAGE_SIZE = 10;

function envDotColor(name) {
  return ENV_COLORS[name] || 'bg-mist';
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.7a3 3 0 004.2 4.2M6.6 6.8C4 8.4 2 12 2 12s4 7 11 7c2 0 3.7-.5 5.1-1.2M17.9 17.4C20.4 15.8 22 12 22 12s-1.6-2.9-4.3-4.9M9.9 5.2C10.6 5.1 11.3 5 12 5c7 0 11 7 11 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
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
  const rows = variables.map((v) => `${csvEscape(v.key)},${csvEscape(v.value)},${v.is_secret !== false}`);
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

const PRESET_EXPIRY = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
];

export default function ProjectDetailPage() {
  const { companyId, projectId } = useParams();
  const router = useRouter();

  const [project, setProject] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [environments, setEnvironments] = useState([]);
  const [activeEnvId, setActiveEnvId] = useState(null);
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [varsLoading, setVarsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // --- search / filter / pagination for the variables list ---
  const [varSearch, setVarSearch] = useState('');
  const [varFilter, setVarFilter] = useState('all'); // all | protected | plain
  const [varPage, setVarPage] = useState(1);

  const [addEnvOpen, setAddEnvOpen] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [addEnvSubmitting, setAddEnvSubmitting] = useState(false);

  const [addVarOpen, setAddVarOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showNewValue, setShowNewValue] = useState(false);
  const [newIsSecret, setNewIsSecret] = useState(true);
  const [addVarSubmitting, setAddVarSubmitting] = useState(false);
  const [addVarError, setAddVarError] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importIsSecret, setImportIsSecret] = useState(true);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState('');

  const [revealed, setRevealed] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const [deletingVar, setDeletingVar] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [shareExpiryOpen, setShareExpiryOpen] = useState(false);
  const [shareExpiryMinutes, setShareExpiryMinutes] = useState(60);
  const [customExpiryValue, setCustomExpiryValue] = useState(1);
  const [customExpiryUnit, setCustomExpiryUnit] = useState('hours');
  const [isCustomExpiry, setIsCustomExpiry] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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
        const [projectRes, companyRes] = await Promise.all([
          api.companies.projects.get(companyId, projectId),
          api.companies.get(companyId),
        ]);
        if (cancelled) return;
        setProject(projectRes.project);
        setCompanyName(companyRes.company?.name || '');
        setEnvironments(projectRes.environments || []);
        const first = projectRes.environments?.[0];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, projectId]);

  // Filtered + paginated view over the currently loaded variables list -
  // everything here is client-side since the whole environment's variables
  // are already fetched in one request.
  const filteredVariables = useMemo(() => {
    let list = variables;
    if (varFilter === 'protected') list = list.filter((v) => v.is_secret !== false);
    if (varFilter === 'plain') list = list.filter((v) => v.is_secret === false);

    const q = varSearch.trim().toLowerCase();
    if (q) list = list.filter((v) => v.key.toLowerCase().includes(q));

    return list;
  }, [variables, varFilter, varSearch]);

  const varTotalPages = Math.max(1, Math.ceil(filteredVariables.length / VARS_PAGE_SIZE));
  const varPageSafe = Math.min(varPage, varTotalPages);
  const paginatedVariables = filteredVariables.slice(
    (varPageSafe - 1) * VARS_PAGE_SIZE,
    varPageSafe * VARS_PAGE_SIZE
  );

  function handleVarSearchChange(value) {
    setVarSearch(value);
    setVarPage(1);
  }

  function handleVarFilterChange(value) {
    setVarFilter(value);
    setVarPage(1);
  }

  async function handleSwitchEnv(envId) {
    setActiveEnvId(envId);
    setRevealed({});
    setError('');
    setVarSearch('');
    setVarFilter('all');
    setVarPage(1);
    await loadVariables(envId);
  }

  async function handleAddEnvironment(e) {
    e.preventDefault();
    if (!newEnvName.trim()) return;
    setError('');
    setAddEnvSubmitting(true);
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
    } finally {
      setAddEnvSubmitting(false);
    }
  }

  async function handleAddVariable(e) {
    e.preventDefault();
    const trimmedKey = newKey.trim();

    if (!trimmedKey && !newValue) {
      setAddVarError('Both key and value are required.');
      return;
    }
    if (!trimmedKey) {
      setAddVarError('Key is required.');
      return;
    }
    if (!newValue) {
      setAddVarError('Value is required.');
      return;
    }

    if (variables.some((v) => v.key === trimmedKey)) {
      setAddVarError(
        `"${trimmedKey}" already exists in ${activeEnv?.name || 'this environment'}. Delete it first.`
      );
      return;
    }

    setAddVarError('');
    setAddVarSubmitting(true);
    try {
      const { variable } = await api.companies.projects.upsertVariable(
        companyId,
        projectId,
        activeEnvId,
        trimmedKey,
        newValue,
        newIsSecret
      );
      setVariables((prev) => [...prev, variable].sort((a, b) => a.key.localeCompare(b.key)));
      setNewKey('');
      setNewValue('');
      setShowNewValue(false);
      setNewIsSecret(true);
      setAddVarOpen(false);
    } catch (err) {
      setAddVarError(err.message);
    } finally {
      setAddVarSubmitting(false);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    const parsed = parseEnvText(importText).map((v) => ({ ...v, is_secret: importIsSecret }));
    if (parsed.length === 0) {
      setImportError('No KEY=VALUE lines found to import');
      return;
    }

    const keys = parsed.map((v) => v.key);
    const duplicatesWithin = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicatesWithin.length > 0) {
      setImportError(`Duplicate keys found in import: ${[...new Set(duplicatesWithin)].join(', ')}`);
      return;
    }

    const existingKeys = new Set(variables.map((v) => v.key));
    const duplicatesWithExisting = parsed.filter((v) => existingKeys.has(v.key));
    if (duplicatesWithExisting.length > 0) {
      setImportError(`Duplicate keys already exist. Delete them first.`);
      return;
    }

    setImportError('');
    setImportSubmitting(true);
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
      setImportError(err.message);
    } finally {
      setImportSubmitting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result || ''));
    reader.readAsText(file);
  }

  async function handleConfirmDelete() {
    setDeleteSubmitting(true);
    try {
      await api.companies.projects.deleteVariable(companyId, projectId, activeEnvId, deletingVar.id);
      setVariables((prev) => prev.filter((v) => v.id !== deletingVar.id));
      setDeletingVar(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteSubmitting(false);
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
    // Copies everything currently matching the search/filter, not just the visible page.
    await navigator.clipboard.writeText(toEnvFormat(filteredVariables));
    setNotice('Copied all as .env format');
    setTimeout(() => setNotice(''), 2000);
  }

  function handleDownloadEnv() {
    downloadText(`${activeEnv?.name || 'env'}.env`, toEnvFormat(filteredVariables));
  }

  function handleDownloadCsv() {
    downloadText(`${activeEnv?.name || 'env'}.csv`, toCsvFormat(filteredVariables));
  }

  // --- Generate Share Link ---
  async function handleGenerateLink(e) {
    e.preventDefault();

    let minutes = shareExpiryMinutes;
    if (isCustomExpiry) {
      const val = parseFloat(customExpiryValue);
      if (isNaN(val) || val <= 0) {
        setShareError('Please enter a positive number.');
        return;
      }
      let computedMinutes;
      switch (customExpiryUnit) {
        case 'minutes':
          computedMinutes = val;
          break;
        case 'hours':
          computedMinutes = val * 60;
          break;
        case 'days':
          computedMinutes = val * 1440;
          break;
        default:
          computedMinutes = val;
      }
      minutes = Math.round(computedMinutes);
      if (minutes < 5) {
        setShareError('Minimum expiry is 5 minutes.');
        return;
      }
      if (minutes > 10080) {
        setShareError('Maximum expiry is 7 days.');
        return;
      }
    }

    setShareError('');
    setGeneratingLink(true);
    try {
      const res = await api.share.create(companyId, projectId, activeEnvId, minutes);
      setShareLink(res.url);
      setShareExpiryOpen(false);
      setShareCopied(false);
      setShowShareModal(true);
    } catch (err) {
      setShareError(err.message);
    } finally {
      setGeneratingLink(false);
    }
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ProjectSkeleton />
      </div>
    );
  }

  const hasVariables = variables.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/dashboard/${companyId}`} className="text-sm text-mist hover:text-paper">
        &larr; {companyName || 'Back to company'}
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
          onClick={() => {
            setError('');
            setNewEnvName('');
            setAddEnvOpen(true);
          }}
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
          onClick={() => {
            setAddVarError('');
            setShowNewValue(false);
            setAddVarOpen(true);
          }}
          className="rounded-sm bg-signal px-3 py-1.5 text-xs font-medium text-ink hover:bg-signal/90"
        >
          + Add variable
        </button>
        <button
          onClick={() => {
            setImportError('');
            setImportOpen(true);
          }}
          className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
        >
          Import .env
        </button>

        {hasVariables && (
          <>
            <button
              onClick={handleCopyAll}
              className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
            >
              Copy all
            </button>
            <button
              onClick={handleDownloadEnv}
              className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
            >
              Download .env
            </button>
            <button
              onClick={handleDownloadCsv}
              className="rounded-sm border border-line px-3 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper"
            >
              Download CSV
            </button>
            <button
              onClick={() => {
                setShareError('');
                setShareExpiryMinutes(60);
                setIsCustomExpiry(false);
                setCustomExpiryValue(1);
                setCustomExpiryUnit('hours');
                setShareExpiryOpen(true);
              }}
              className="rounded-sm bg-signal px-3 py-1.5 text-xs font-medium text-ink hover:bg-signal/90"
            >
              Generate link
            </button>
          </>
        )}
      </div>

      {/* Search + filter for the variables list */}
      {hasVariables && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={varSearch}
            onChange={(e) => handleVarSearchChange(e.target.value)}
            placeholder="Search by key..."
            className="w-full max-w-xs rounded-sm border border-line bg-surface px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          />
          <select
            value={varFilter}
            onChange={(e) => handleVarFilterChange(e.target.value)}
            className="rounded-sm border border-line bg-surface px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          >
            <option value="all">All</option>
            <option value="protected">Protected only</option>
            <option value="plain">Plain only</option>
          </select>
        </div>
      )}

      {/* Variables list */}
      <div className="mt-4">
        {varsLoading ? (
          <div className="space-y-px overflow-hidden rounded-sm border border-line">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-line/40" />
            ))}
          </div>
        ) : variables.length === 0 ? (
          <div className="rounded-sm border border-dashed border-line p-10 text-center">
            <p className="font-mono text-sm text-mist">No variables in this environment yet.</p>
          </div>
        ) : filteredVariables.length === 0 ? (
          <div className="rounded-sm border border-dashed border-line p-10 text-center">
            <p className="font-mono text-sm text-mist">No variables match your search/filter.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
              {paginatedVariables.map((v) => {
                const isSecret = v.is_secret !== false;
                return (
                  <li
                    key={v.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm text-paper">{v.key}</p>
                        <span
                          className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                            isSecret ? 'border border-line text-mist' : 'bg-signal/15 text-signal'
                          }`}
                        >
                          {isSecret ? 'protected' : 'plain'}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-sm text-mist">
                        {!isSecret || revealed[v.id]
                          ? v.value
                          : '\u2022'.repeat(Math.min(v.value.length, 24))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isSecret && (
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
                        onClick={() => setDeletingVar(v)}
                        className="rounded-sm border border-line px-3 py-1.5 text-xs text-alert hover:border-alert/60"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={varPageSafe} totalPages={varTotalPages} onChange={setVarPage} />
          </>
        )}
      </div>

      {/* Add environment modal */}
      <Modal open={addEnvOpen} onClose={() => setAddEnvOpen(false)} title="New environment">
        <form onSubmit={handleAddEnvironment} className="space-y-3" autoComplete="off">
          <input
            autoFocus
            autoComplete="off"
            value={newEnvName}
            onChange={(e) => setNewEnvName(e.target.value)}
            placeholder="e.g. qa"
            className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          />
          <button
            disabled={addEnvSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90 disabled:opacity-60"
          >
            {addEnvSubmitting && <Spinner className="h-4 w-4" />}
            {addEnvSubmitting ? 'Creating\u2026' : 'Create'}
          </button>
        </form>
      </Modal>

      {/* Add variable modal */}
      <Modal open={addVarOpen} onClose={() => setAddVarOpen(false)} title="Add variable">
        <form onSubmit={handleAddVariable} className="space-y-3" autoComplete="off">
          {addVarError && <p className="text-sm text-alert">{addVarError}</p>}
          <div>
            <label className="mb-1 block text-xs text-mist">Key</label>
            <input
              autoFocus
              autoComplete="off"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="DATABASE_URL"
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none focus:border-signal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-mist">Value</label>
            <div className="relative">
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="postgres://..."
                style={showNewValue ? undefined : { WebkitTextSecurity: 'disc' }}
                className="w-full rounded-sm border border-line bg-ink px-3 py-2 pr-10 font-mono text-sm text-paper outline-none focus:border-signal"
              />
              <button
                type="button"
                onClick={() => setShowNewValue((v) => !v)}
                aria-label={showNewValue ? 'Hide value' : 'Show value'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mist hover:text-paper"
              >
                {showNewValue ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
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
          <button
            disabled={addVarSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90 disabled:opacity-60"
          >
            {addVarSubmitting && <Spinner className="h-4 w-4" />}
            {addVarSubmitting ? 'Adding\u2026' : 'Add variable'}
          </button>
        </form>
      </Modal>

      {/* Bulk import modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import .env">
        <form onSubmit={handleImport} className="space-y-3" autoComplete="off">
          {importError && <p className="text-sm text-alert">{importError}</p>}
          <div>
            <label className="mb-1 block text-xs text-mist">Upload a file (optional)</label>
            <input
              type="file"
              accept=".env,.txt,text/plain"
              onChange={handleFileSelect}
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-xs text-mist file:mr-3 file:rounded-sm file:border-0 file:bg-signal file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
          </div>
          <p className="text-xs text-mist">Or paste KEY=VALUE lines below.</p>
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
          <button
            disabled={importSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90 disabled:opacity-60"
          >
            {importSubmitting && <Spinner className="h-4 w-4" />}
            {importSubmitting ? 'Importing\u2026' : 'Import'}
          </button>
        </form>
      </Modal>

      {/* Delete variable confirmation */}
      <Modal open={!!deletingVar} onClose={() => setDeletingVar(null)} title="Delete variable">
        <p className="text-sm text-alert">
          Delete <span className="font-mono">{deletingVar?.key}</span> permanently? This can&apos;t be
          undone.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleConfirmDelete}
            disabled={deleteSubmitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-alert px-4 py-2 text-sm font-medium text-ink hover:bg-alert/90 disabled:opacity-60"
          >
            {deleteSubmitting && <Spinner className="h-4 w-4" />}
            Yes, delete
          </button>
          <button
            onClick={() => setDeletingVar(null)}
            className="flex-1 rounded-sm border border-line px-4 py-2 text-sm text-mist hover:text-paper"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Choose expiry modal */}
      <Modal open={shareExpiryOpen} onClose={() => setShareExpiryOpen(false)} title="Generate link">
        <form onSubmit={handleGenerateLink} className="space-y-3">
          <p className="text-xs text-mist">
            This link will show every variable in <span className="font-mono">{activeEnv?.name}</span>{' '}
            one time, then stop working. Choose how long it stays valid if it&apos;s never opened.
          </p>

          <div className="space-y-2">
            {PRESET_EXPIRY.map((opt) => (
              <label key={opt.minutes} className="flex items-center gap-2 text-sm text-paper">
                <input
                  type="radio"
                  name="expiry"
                  checked={!isCustomExpiry && shareExpiryMinutes === opt.minutes}
                  onChange={() => {
                    setIsCustomExpiry(false);
                    setShareExpiryMinutes(opt.minutes);
                  }}
                  className="accent-signal"
                />
                {opt.label}
              </label>
            ))}

            <label className="flex items-center gap-2 text-sm text-paper">
              <input
                type="radio"
                name="expiry"
                checked={isCustomExpiry}
                onChange={() => setIsCustomExpiry(true)}
                className="accent-signal"
              />
              Custom
            </label>

            {isCustomExpiry && (
              <div className="ml-6 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customExpiryValue}
                  onChange={(e) => setCustomExpiryValue(parseFloat(e.target.value) || 0)}
                  className="w-20 rounded-sm border border-line bg-ink px-2 py-1 text-sm text-paper outline-none focus:border-signal"
                />
                <select
                  value={customExpiryUnit}
                  onChange={(e) => setCustomExpiryUnit(e.target.value)}
                  className="rounded-sm border border-line bg-ink px-2 py-1 text-sm text-paper outline-none focus:border-signal"
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <span className="text-xs text-mist">(5 min &ndash; 7 days)</span>
              </div>
            )}
          </div>

          {shareError && <p className="text-sm text-alert">{shareError}</p>}
          <button
            disabled={generatingLink}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90 disabled:opacity-60"
          >
            {generatingLink && <Spinner className="h-4 w-4" />}
            {generatingLink ? 'Generating\u2026' : 'Generate link'}
          </button>
        </form>
      </Modal>

      {/* Share link result modal */}
      <Modal open={showShareModal} onClose={() => setShowShareModal(false)} title="Shareable link">
        <div className="space-y-4">
          <p className="text-sm text-mist">
            This link is viewable <strong>once</strong>.
          </p>
          <div className="flex items-center gap-2 rounded-sm border border-line bg-ink p-2">
            <input
              readOnly
              value={shareLink}
              className="flex-1 bg-transparent px-2 py-1 text-sm text-paper outline-none"
            />
            <button
              onClick={copyShareLink}
              className="rounded-sm bg-signal px-3 py-1 text-sm font-medium text-ink hover:bg-signal/90"
            >
              Copy
            </button>
            {shareCopied && <span className="animate-pulse text-xs text-signal">Copied!</span>}
          </div>
          <button
            onClick={() => setShowShareModal(false)}
            className="w-full rounded-sm border border-line py-2 text-sm text-mist hover:text-paper"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}