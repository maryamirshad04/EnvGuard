'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDashboard } from '@/lib/DashboardContext';
import Modal from './Modal';

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export default function DashboardNavbar() {
  const router = useRouter();
  const { companyId, projectId } = useParams();
  const { user, companies, refreshCompanies, logout } = useDashboard();

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const activeCompany = companies.find((c) => c.id === companyId);
  const activeProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!companyId) {
      setProjects([]);
      return;
    }
    api.companies.projects
      .list(companyId)
      .then((res) => setProjects(res.projects || []))
      .catch(() => setProjects([]));
  }, [companyId]);

  async function handleCreateCompany(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    try {
      const { company } = await api.companies.create(newName.trim());
      await refreshCompanies();
      setCreatingCompany(false);
      setNewName('');
      router.push(`/dashboard/${company.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateProject(e) {
    e.preventDefault();
    if (!newName.trim() || !companyId) return;
    setError('');
    try {
      const { project } = await api.companies.projects.create(companyId, newName.trim());
      setProjects((prev) => [project, ...prev]);
      setCreatingProject(false);
      setNewName('');
      router.push(`/dashboard/${companyId}/projects/${project.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 font-mono text-sm text-signal"
            >
              <img 
    src="/lock.svg" 
    alt="Envguard icon" 
    className="inline-block h-5 w-5 text-signal align-middle" 
  /> 
  <span className="align-middle">envguard</span>
            </Link>

            {/* Company switcher */}
            <div className="relative">
              <button
                onClick={() => setCompanyMenuOpen((v) => !v)}
                className="flex max-w-[130px] items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-xs text-paper hover:border-signal/40 sm:max-w-[180px] sm:px-3 sm:text-sm"
              >
                <span className="truncate">{activeCompany?.name || 'Companies'}</span>
                <Chevron />
              </button>
              {companyMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCompanyMenuOpen(false)} />
                  <div className="absolute left-0 z-20 mt-2 w-56 rounded-sm border border-line bg-surface py-1 shadow-lg">
                    {companies.map((c) => (
                      <Link
                        key={c.id}
                        href={`/dashboard/${c.id}`}
                        onClick={() => setCompanyMenuOpen(false)}
                        className={`block truncate px-3 py-2 text-sm hover:bg-ink ${
                          c.id === companyId ? 'text-signal' : 'text-paper'
                        }`}
                      >
                        {c.name}
                        <span className="ml-2 font-mono text-[10px] uppercase text-mist">{c.role}</span>
                      </Link>
                    ))}
                    <button
                      onClick={() => {
                        setCompanyMenuOpen(false);
                        setError('');
                        setNewName('');
                        setCreatingCompany(true);
                      }}
                      className="block w-full border-t border-line px-3 py-2 text-left text-sm text-mist hover:bg-ink hover:text-paper"
                    >
                      + New company
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Project switcher */}
            {companyId && (
              <div className="relative">
                <button
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  className="flex max-w-[130px] items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-xs text-paper hover:border-signal/40 sm:max-w-[180px] sm:px-3 sm:text-sm"
                >
                  <span className="truncate">{activeProject?.name || 'Projects'}</span>
                  <Chevron />
                </button>
                {projectMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProjectMenuOpen(false)} />
                    <div className="absolute left-0 z-20 mt-2 w-56 rounded-sm border border-line bg-surface py-1 shadow-lg">
                      {projects.length === 0 && (
                        <p className="px-3 py-2 text-xs text-mist">No projects yet</p>
                      )}
                      {projects.map((p) => (
                        <Link
                          key={p.id}
                          href={`/dashboard/${companyId}/projects/${p.id}`}
                          onClick={() => setProjectMenuOpen(false)}
                          className={`block truncate px-3 py-2 text-sm hover:bg-ink ${
                            p.id === projectId ? 'text-signal' : 'text-paper'
                          }`}
                        >
                          {p.name}
                        </Link>
                      ))}
                      <button
                        onClick={() => {
                          setProjectMenuOpen(false);
                          setError('');
                          setNewName('');
                          setCreatingProject(true);
                        }}
                        className="block w-full border-t border-line px-3 py-2 text-left text-sm text-mist hover:bg-ink hover:text-paper"
                      >
                        + New project
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: user + logout */}
          <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-4">
            <span className="hidden max-w-[160px] truncate text-sm text-mist sm:inline">
              {user?.email?.split('@')[0]}
            </span>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs text-mist sm:hidden"
              title={user?.email}
            >
              {user?.email?.[0]?.toUpperCase()}
            </span>
            <button
              onClick={logout}
              className="shrink-0 rounded-sm border border-line px-2.5 py-1.5 text-xs text-mist hover:border-signal/40 hover:text-paper sm:px-3 sm:text-sm"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <Modal open={creatingCompany} onClose={() => setCreatingCompany(false)} title="New company">
        <form onSubmit={handleCreateCompany} className="space-y-3">
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

      <Modal open={creatingProject} onClose={() => setCreatingProject(false)} title="New project">
        <form onSubmit={handleCreateProject} className="space-y-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
          />
          {error && <p className="text-sm text-alert">{error}</p>}
          <button className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90">
            Create
          </button>
        </form>
      </Modal>
    </header>
  );
}