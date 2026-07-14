const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

export const api = {
  signup: (email, password) =>
    request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  verifyLogin2fa: (tempToken, code) =>
    request('/api/auth/login/2fa', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  updateEmail: (email) =>
    request('/api/auth/email', { method: 'PATCH', body: JSON.stringify({ email }) }),

  twoFactor: {
    status: () => request('/api/auth/2fa/status'),
    setup: () => request('/api/auth/2fa/setup', { method: 'POST' }),
    verify: (code) => request('/api/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (password) =>
      request('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) }),
  },

  companies: {
    list: () => request('/api/companies'),
    create: (name) => request('/api/companies', { method: 'POST', body: JSON.stringify({ name }) }),
    get: (companyId) => request(`/api/companies/${companyId}`),
    update: (companyId, name) =>
      request(`/api/companies/${companyId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    remove: (companyId) => request(`/api/companies/${companyId}`, { method: 'DELETE' }),
    members: (companyId) => request(`/api/companies/${companyId}/members`),

    invites: {
      list: (companyId) => request(`/api/companies/${companyId}/invites`),
      create: (companyId, email, role) =>
        request(`/api/companies/${companyId}/invites`, {
          method: 'POST',
          body: JSON.stringify({ email, role }),
        }),
      revoke: (companyId, inviteId) =>
        request(`/api/companies/${companyId}/invites/${inviteId}`, { method: 'DELETE' }),
    },

    projects: {
      list: (companyId) => request(`/api/companies/${companyId}/projects`),
      create: (companyId, name) =>
        request(`/api/companies/${companyId}/projects`, { method: 'POST', body: JSON.stringify({ name }) }),
      get: (companyId, projectId) => request(`/api/companies/${companyId}/projects/${projectId}`),
      update: (companyId, projectId, name) =>
        request(`/api/companies/${companyId}/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        }),
      remove: (companyId, projectId) =>
        request(`/api/companies/${companyId}/projects/${projectId}`, { method: 'DELETE' }),

      createEnvironment: (companyId, projectId, name) =>
        request(`/api/companies/${companyId}/projects/${projectId}/environments`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        }),

      listVariables: (companyId, projectId, envId) =>
        request(`/api/companies/${companyId}/projects/${projectId}/environments/${envId}/variables`),

      upsertVariable: (companyId, projectId, envId, key, value, isSecret = true) =>
        request(`/api/companies/${companyId}/projects/${projectId}/environments/${envId}/variables`, {
          method: 'POST',
          body: JSON.stringify({ key, value, is_secret: isSecret }),
        }),

      importVariables: (companyId, projectId, envId, variables) =>
        request(`/api/companies/${companyId}/projects/${projectId}/environments/${envId}/variables/bulk`, {
          method: 'POST',
          body: JSON.stringify({ variables }),
        }),

      deleteVariable: (companyId, projectId, envId, varId) =>
        request(
          `/api/companies/${companyId}/projects/${projectId}/environments/${envId}/variables/${varId}`,
          { method: 'DELETE' }
        ),
    },
  },

  invites: {
    get: (token) => request(`/api/invites/${token}`),
    accept: (token) => request(`/api/invites/${token}/accept`, { method: 'POST' }),
  },

  share: {
    create: (companyId, projectId, environmentId) =>
      request('/api/share', {
        method: 'POST',
        body: JSON.stringify({ companyId, projectId, environmentId }),
      }),
    get: (token) => request(`/api/share/${token}`),
  },
};