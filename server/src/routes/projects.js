const express = require('express');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();
router.use(requireAuth);

// --- helpers ---------------------------------------------------------

async function getOwnedProject(projectId, userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

async function getOwnedEnvironment(projectId, envId, userId) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  const { data, error } = await supabase
    .from('environments')
    .select('*')
    .eq('id', envId)
    .eq('project_id', project.id)
    .single();

  if (error || !data) return null;
  return data;
}

// --- projects ----------------------------------------------------------

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', req.user.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ projects: data });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const { data, error } = await supabase
    .from('projects')
    .insert({ owner_id: req.user.userId, name: name.trim() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Seed the three common environments so there's somewhere to start
  const { error: seedError } = await supabase
    .from('environments')
    .insert(['development', 'staging', 'production'].map((n) => ({ project_id: data.id, name: n })));
  if (seedError) console.error('Failed to seed default environments:', seedError);

  res.status(201).json({ project: data });
});

router.get('/:projectId', async (req, res) => {
  const project = await getOwnedProject(req.params.projectId, req.user.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { data: environments, error } = await supabase
    .from('environments')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ project, environments });
});

// --- environments --------------------------------------------------------

router.post('/:projectId/environments', async (req, res) => {
  const project = await getOwnedProject(req.params.projectId, req.user.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Environment name is required' });

  const { data, error } = await supabase
    .from('environments')
    .insert({ project_id: project.id, name: name.trim().toLowerCase() })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That environment already exists in this project' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ environment: data });
});


router.get('/:projectId/environments/:envId/variables', async (req, res) => {
  const env = await getOwnedEnvironment(req.params.projectId, req.params.envId, req.user.userId);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  const { data, error } = await supabase
    .from('env_variables')
    .select('*')
    .eq('environment_id', env.id)
    .order('key', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const variables = data.map((v) => ({
    id: v.id,
    key: v.key,
    value: decrypt(v.value_encrypted),
    updated_at: v.updated_at,
  }));

  res.json({ variables });
});

router.post('/:projectId/environments/:envId/variables', async (req, res) => {
  const env = await getOwnedEnvironment(req.params.projectId, req.params.envId, req.user.userId);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  const { key, value } = req.body;
  if (!key?.trim() || value === undefined || value === '') {
    return res.status(400).json({ error: 'Both key and value are required' });
  }

  const value_encrypted = encrypt(value);

  const { data, error } = await supabase
    .from('env_variables')
    .upsert(
      {
        environment_id: env.id,
        key: key.trim(),
        value_encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'environment_id,key' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    variable: { id: data.id, key: data.key, value, updated_at: data.updated_at },
  });
});

router.delete('/:projectId/environments/:envId/variables/:varId', async (req, res) => {
  const env = await getOwnedEnvironment(req.params.projectId, req.params.envId, req.user.userId);
  if (!env) return res.status(404).json({ error: 'Environment not found' });

  const { error } = await supabase
    .from('env_variables')
    .delete()
    .eq('id', req.params.varId)
    .eq('environment_id', env.id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
