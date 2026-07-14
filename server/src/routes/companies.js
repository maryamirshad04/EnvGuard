const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { requireMember, requireAdmin } = require('../middleware/companyAccess');
const { encrypt, decrypt } = require('../utils/crypto');
const { sendInviteEmail } = require('../config/mailjet');

const router = express.Router();
router.use(requireAuth);

// --- companies -----------------------------------------------------------

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('company_members')
    .select('role, joined_at, companies(id, name, created_at)')
    .eq('user_id', req.user.userId);

  if (error) return res.status(500).json({ error: error.message });

  const companies = data
    .filter((row) => row.companies)
    .map((row) => ({ ...row.companies, role: row.role, joined_at: row.joined_at }));

  res.json({ companies });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Company name is required' });

  const { data: company, error } = await supabase
    .from('companies')
    .insert({ name: name.trim(), created_by: req.user.userId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { error: memberError } = await supabase
    .from('company_members')
    .insert({ company_id: company.id, user_id: req.user.userId, role: 'admin' });

  if (memberError) return res.status(500).json({ error: memberError.message });

  res.status(201).json({ company: { ...company, role: 'admin' } });
});

router.get('/:companyId', requireMember, async (req, res) => {
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', req.params.companyId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ company: { ...company, role: req.membership.role } });
});

router.patch('/:companyId', requireMember, requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Company name is required' });

  const { data, error } = await supabase
    .from('companies')
    .update({ name: name.trim() })
    .eq('id', req.params.companyId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ company: { ...data, role: req.membership.role } });
});

router.delete('/:companyId', requireMember, requireAdmin, async (req, res) => {
  // Cascades to company_members, invites, projects, environments, and
  // env_variables via the ON DELETE CASCADE foreign keys already in the schema.
  const { error } = await supabase.from('companies').delete().eq('id', req.params.companyId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- members ---------------------------------------------------------------

router.get('/:companyId/members', requireMember, async (req, res) => {
  const { data, error } = await supabase
    .from('company_members')
    .select('id, role, joined_at, users(id, email)')
    .eq('company_id', req.params.companyId);

  if (error) return res.status(500).json({ error: error.message });

  const members = data.map((m) => ({
    id: m.id,
    role: m.role,
    joined_at: m.joined_at,
    email: m.users?.email,
    user_id: m.users?.id,
  }));

  res.json({ members });
});

// --- invites -------------------------

router.get('/:companyId/invites', requireMember, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('company_id', req.params.companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ invites: data });
});

router.post('/:companyId/invites', requireMember, requireAdmin, async (req, res) => {
  const { email, role } = req.body;
  if (!email?.trim() || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'A valid email and role (admin or member) are required' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      company_id: req.params.companyId,
      email: email.trim().toLowerCase(),
      role,
      invited_by: req.user.userId,
      token,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', req.params.companyId)
    .single();

  const inviteLink = `${process.env.CLIENT_URL}/invite/${token}`;

  try {
    await sendInviteEmail({
      toEmail: invite.email,
      companyName: company?.name || 'a company',
      role,
      inviteLink,
      invitedByEmail: req.user.email,
    });
  } catch (mailError) {
    console.error('Mailjet send failed:', mailError);
    return res.status(201).json({
      invite,
      warning: `Invite created, but the email failed to send. Share this link manually: ${inviteLink}`,
    });
  }

  res.status(201).json({ invite });
});

router.delete('/:companyId/invites/:inviteId', requireMember, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', req.params.inviteId)
    .eq('company_id', req.params.companyId);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- projects ---------------

async function getCompanyProject(companyId, projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .single();
  if (error || !data) return null;
  return data;
}

router.get('/:companyId/projects', requireMember, async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', req.params.companyId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ projects: data });
});

router.post('/:companyId/projects', requireMember, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const { data, error } = await supabase
    .from('projects')
    .insert({ company_id: req.params.companyId, name: name.trim() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { error: seedError } = await supabase
    .from('environments')
    .insert(['development', 'staging', 'production'].map((n) => ({ project_id: data.id, name: n })));
  if (seedError) console.error('Failed to seed default environments:', seedError);

  res.status(201).json({ project: data });
});

router.get('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { data: environments, error } = await supabase
    .from('environments')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ project, environments });
});

router.patch('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  const { data, error } = await supabase
    .from('projects')
    .update({ name: name.trim() })
    .eq('id', project.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ project: data });
});

router.delete('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { error } = await supabase.from('projects').delete().eq('id', project.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

router.post('/:companyId/projects/:projectId/environments', requireMember, async (req, res) => {
  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
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

async function getCompanyEnvironment(companyId, projectId, envId) {
  const project = await getCompanyProject(companyId, projectId);
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

router.get(
  '/:companyId/projects/:projectId/environments/:envId/variables',
  requireMember,
  async (req, res) => {
    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
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
      is_secret: v.is_secret,
      updated_at: v.updated_at,
    }));

    res.json({ variables });
  }
);

router.post(
  '/:companyId/projects/:projectId/environments/:envId/variables',
  requireMember,
  async (req, res) => {
    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) return res.status(404).json({ error: 'Environment not found' });

    const { key, value, is_secret } = req.body;
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
          is_secret: is_secret !== false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'environment_id,key' }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({
      variable: { id: data.id, key: data.key, value, is_secret: data.is_secret, updated_at: data.updated_at },
    });
  }
);

router.delete(
  '/:companyId/projects/:projectId/environments/:envId/variables/:varId',
  requireMember,
  async (req, res) => {
    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) return res.status(404).json({ error: 'Environment not found' });

    const { error } = await supabase
      .from('env_variables')
      .delete()
      .eq('id', req.params.varId)
      .eq('environment_id', env.id);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  }
);

// Bulk import
router.post(
  '/:companyId/projects/:projectId/environments/:envId/variables/bulk',
  requireMember,
  async (req, res) => {
    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) return res.status(404).json({ error: 'Environment not found' });

    const { variables } = req.body;
    if (!Array.isArray(variables) || variables.length === 0) {
      return res.status(400).json({ error: 'No variables to import' });
    }

    const valid = variables.filter((v) => v.key?.trim() && v.value !== undefined && v.value !== '');
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid KEY=VALUE pairs found' });
    }

    const rows = valid.map((v) => ({
      environment_id: env.id,
      key: v.key.trim(),
      value_encrypted: encrypt(v.value),
      is_secret: v.is_secret !== false,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('env_variables')
      .upsert(rows, { onConflict: 'environment_id,key' })
      .select();

    if (error) return res.status(500).json({ error: error.message });

    const valueByKey = Object.fromEntries(valid.map((v) => [v.key.trim(), v.value]));
    const resultVariables = data.map((v) => ({
      id: v.id,
      key: v.key,
      value: valueByKey[v.key],
      is_secret: v.is_secret,
      updated_at: v.updated_at,
    }));

    res.status(201).json({ variables: resultVariables });
  }
);

module.exports = router;
