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

  projects: {
    list: () => request('/api/projects'),
    create: (name) => request('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    get: (projectId) => request(`/api/projects/${projectId}`),

    createEnvironment: (projectId, name) =>
      request(`/api/projects/${projectId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),

    listVariables: (projectId, envId) =>
      request(`/api/projects/${projectId}/environments/${envId}/variables`),

    upsertVariable: (projectId, envId, key, value) =>
      request(`/api/projects/${projectId}/environments/${envId}/variables`, {
        method: 'POST',
        body: JSON.stringify({ key, value }),
      }),

    deleteVariable: (projectId, envId, varId) =>
      request(`/api/projects/${projectId}/environments/${envId}/variables/${varId}`, {
        method: 'DELETE',
      }),
  },
};
