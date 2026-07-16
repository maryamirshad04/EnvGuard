const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { requireMember, requireAdmin } = require('../middleware/companyAccess');
const { encrypt, decrypt } = require('../utils/crypto');
const { sendInviteEmail } = require('../config/mailjet');
const logger = require('../utils/logger');
const { maskEmail } = require('../utils/helpers');

const router = express.Router();
router.use(requireAuth);

// --- companies -----------------------------------------------------------

router.get('/', async (req, res) => {
  logger.info({ userId: req.user.userId }, 'Fetching user companies');

  const { data, error } = await supabase
    .from('company_members')
    .select('role, joined_at, companies(id, name, created_at)')
    .eq('user_id', req.user.userId);

  if (error) {
    logger.error({ userId: req.user.userId, error: error.message }, 'Failed to fetch companies');
    return res.status(500).json({ error: error.message });
  }

  const companies = data
    .filter((row) => row.companies)
    .map((row) => ({ ...row.companies, role: row.role, joined_at: row.joined_at }));

  logger.info({ userId: req.user.userId, count: companies.length }, `Fetched ${companies.length} companies`);
  res.json({ companies });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  logger.info({ userId: req.user.userId, companyName: name }, 'Creating new company');

  if (!name?.trim()) {
    logger.warn({ userId: req.user.userId }, 'Company creation missing name');
    return res.status(400).json({ error: 'Company name is required' });
  }

  const { data: company, error } = await supabase
    .from('companies')
    .insert({ name: name.trim(), created_by: req.user.userId })
    .select()
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, error: error.message }, 'Failed to create company');
    return res.status(500).json({ error: error.message });
  }

  const { error: memberError } = await supabase
    .from('company_members')
    .insert({ company_id: company.id, user_id: req.user.userId, role: 'admin' });

  if (memberError) {
    logger.error({ userId: req.user.userId, companyId: company.id, error: memberError.message }, 'Failed to add creator as member');
    return res.status(500).json({ error: memberError.message });
  }

  logger.info({ userId: req.user.userId, companyId: company.id, companyName: company.name }, 'Company created successfully');
  res.status(201).json({ company: { ...company, role: 'admin' } });
});

router.get('/:companyId', requireMember, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Fetching company details');

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', req.params.companyId)
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to fetch company');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: company.id }, 'Company details fetched');
  res.json({ company: { ...company, role: req.membership.role } });
});

router.patch('/:companyId', requireMember, requireAdmin, async (req, res) => {
  const { name } = req.body;
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, newName: name }, 'Updating company');

  if (!name?.trim()) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId }, 'Company update missing name');
    return res.status(400).json({ error: 'Company name is required' });
  }

  const { data, error } = await supabase
    .from('companies')
    .update({ name: name.trim() })
    .eq('id', req.params.companyId)
    .select()
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to update company');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: data.id, newName: data.name }, 'Company updated successfully');
  res.json({ company: { ...data, role: req.membership.role } });
});

router.delete('/:companyId', requireMember, requireAdmin, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Deleting company');

  const { error } = await supabase.from('companies').delete().eq('id', req.params.companyId);
  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to delete company');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Company deleted successfully');
  res.status(204).send();
});

// --- members ---------------------------------------------------------------

router.get('/:companyId/members', requireMember, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Fetching company members');

  const { data, error } = await supabase
    .from('company_members')
    .select('id, role, joined_at, users(id, email)')
    .eq('company_id', req.params.companyId);

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to fetch members');
    return res.status(500).json({ error: error.message });
  }

  const members = data.map((m) => ({
    id: m.id,
    role: m.role,
    joined_at: m.joined_at,
    email: m.users?.email,
    user_id: m.users?.id,
  }));

  logger.info({ userId: req.user.userId, companyId: req.params.companyId, count: members.length }, `Fetched ${members.length} members`);
  res.json({ members });
});

// --- invites -------------------------

router.get('/:companyId/invites', requireMember, requireAdmin, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Fetching company invites');

  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('company_id', req.params.companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to fetch invites');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: req.params.companyId, count: data.length }, `Fetched ${data.length} invites`);
  res.json({ invites: data });
});

router.post('/:companyId/invites', requireMember, requireAdmin, async (req, res) => {
  const { email, role } = req.body;
  const maskedEmail = maskEmail(email);
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, email: maskedEmail, role }, 'Creating invite');

  if (!email?.trim() || !['admin', 'member'].includes(role)) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId, email: maskedEmail }, 'Invalid invite data');
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

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, email: maskedEmail, error: error.message }, 'Failed to create invite');
    return res.status(500).json({ error: error.message });
  }

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
    logger.info({ userId: req.user.userId, companyId: req.params.companyId, inviteId: invite.id, email: maskedEmail }, 'Invite created and email sent');
  } catch (mailError) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, inviteId: invite.id, email: maskedEmail, error: mailError.message }, 'Mailjet send failed invite created but email not sent');
    return res.status(201).json({
      invite,
      warning: `Invite created, but the email failed to send. Share this link manually: ${inviteLink}`,
    });
  }

  res.status(201).json({ invite });
});

router.delete('/:companyId/invites/:inviteId', requireMember, requireAdmin, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, inviteId: req.params.inviteId }, 'Revoking invite');

  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', req.params.inviteId)
    .eq('company_id', req.params.companyId);

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, inviteId: req.params.inviteId, error: error.message }, 'Failed to revoke invite');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: req.params.companyId, inviteId: req.params.inviteId }, 'Invite revoked successfully');
  res.status(204).send();
});

// --- projects ---------------

async function getCompanyProject(companyId, projectId) {
  logger.debug({ companyId, projectId }, 'Fetching company project');
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .single();
  if (error || !data) {
    logger.debug({ companyId, projectId, error: error?.message }, 'Project not found');
    return null;
  }
  logger.debug({ companyId, projectId, projectName: data.name }, 'Project found');
  return data;
}

router.get('/:companyId/projects', requireMember, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId }, 'Fetching company projects');

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', req.params.companyId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to fetch projects');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, companyId: req.params.companyId, count: data.length }, `Fetched ${data.length} projects`);
  res.json({ projects: data });
});

router.post('/:companyId/projects', requireMember, async (req, res) => {
  const { name } = req.body;
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectName: name }, 'Creating project');

  if (!name?.trim()) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId }, 'Project creation missing name');
    return res.status(400).json({ error: 'Project name is required' });
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ company_id: req.params.companyId, name: name.trim() })
    .select()
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, companyId: req.params.companyId, error: error.message }, 'Failed to create project');
    return res.status(500).json({ error: error.message });
  }

  const { error: seedError } = await supabase
    .from('environments')
    .insert(['development', 'staging', 'production'].map((n) => ({ project_id: data.id, name: n })));
  if (seedError) {
    logger.error({ userId: req.user.userId, projectId: data.id, error: seedError.message }, 'Failed to seed default environments');
  }

  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: data.id, projectName: data.name }, 'Project created successfully');
  res.status(201).json({ project: data });
});

router.get('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Fetching project details');

  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Project not found');
    return res.status(404).json({ error: 'Project not found' });
  }

  const { data: environments, error } = await supabase
    .from('environments')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ userId: req.user.userId, projectId: project.id, error: error.message }, 'Failed to fetch environments');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, projectId: project.id, envCount: environments.length }, 'Project details fetched');
  res.json({ project, environments });
});

router.patch('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  const { name } = req.body;
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, newName: name }, 'Updating project');

  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Project not found for update');
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!name?.trim()) {
    logger.warn({ userId: req.user.userId, projectId: project.id }, 'Project update missing name');
    return res.status(400).json({ error: 'Project name is required' });
  }

  const { data, error } = await supabase
    .from('projects')
    .update({ name: name.trim() })
    .eq('id', project.id)
    .select()
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, projectId: project.id, error: error.message }, 'Failed to update project');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, projectId: data.id, newName: data.name }, 'Project updated successfully');
  res.json({ project: data });
});

router.delete('/:companyId/projects/:projectId', requireMember, async (req, res) => {
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Deleting project');

  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Project not found for deletion');
    return res.status(404).json({ error: 'Project not found' });
  }

  const { error } = await supabase.from('projects').delete().eq('id', project.id);
  if (error) {
    logger.error({ userId: req.user.userId, projectId: project.id, error: error.message }, 'Failed to delete project');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, projectId: project.id }, 'Project deleted successfully');
  res.status(204).send();
});

router.post('/:companyId/projects/:projectId/environments', requireMember, async (req, res) => {
  const { name } = req.body;
  logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, envName: name }, 'Creating environment');

  const project = await getCompanyProject(req.params.companyId, req.params.projectId);
  if (!project) {
    logger.warn({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId }, 'Project not found for environment creation');
    return res.status(404).json({ error: 'Project not found' });
  }

  if (!name?.trim()) {
    logger.warn({ userId: req.user.userId, projectId: project.id }, 'Environment creation missing name');
    return res.status(400).json({ error: 'Environment name is required' });
  }

  const { data, error } = await supabase
    .from('environments')
    .insert({ project_id: project.id, name: name.trim().toLowerCase() })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      logger.warn({ userId: req.user.userId, projectId: project.id, envName: name }, 'Environment already exists');
      return res.status(409).json({ error: 'That environment already exists in this project' });
    }
    logger.error({ userId: req.user.userId, projectId: project.id, error: error.message }, 'Failed to create environment');
    return res.status(500).json({ error: error.message });
  }

  logger.info({ userId: req.user.userId, projectId: project.id, envId: data.id, envName: data.name }, 'Environment created successfully');
  res.status(201).json({ environment: data });
});

async function getCompanyEnvironment(companyId, projectId, envId) {
  logger.debug({ companyId, projectId, envId }, 'Fetching company environment');
  const project = await getCompanyProject(companyId, projectId);
  if (!project) {
    logger.debug({ companyId, projectId, envId }, 'Project not found for environment');
    return null;
  }

  const { data, error } = await supabase
    .from('environments')
    .select('*')
    .eq('id', envId)
    .eq('project_id', project.id)
    .single();

  if (error || !data) {
    logger.debug({ companyId, projectId, envId, error: error?.message }, 'Environment not found');
    return null;
  }
  logger.debug({ companyId, projectId, envId, envName: data.name }, 'Environment found');
  return data;
}

router.get(
  '/:companyId/projects/:projectId/environments/:envId/variables',
  requireMember,
  async (req, res) => {
    logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, envId: req.params.envId }, 'Fetching environment variables');

    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) {
      logger.warn({ userId: req.user.userId, projectId: req.params.projectId, envId: req.params.envId }, 'Environment not found');
      return res.status(404).json({ error: 'Environment not found' });
    }

    const { data, error } = await supabase
      .from('env_variables')
      .select('*')
      .eq('environment_id', env.id)
      .order('key', { ascending: true });

    if (error) {
      logger.error({ userId: req.user.userId, envId: env.id, error: error.message }, 'Failed to fetch variables');
      return res.status(500).json({ error: error.message });
    }

    const variables = data.map((v) => ({
      id: v.id,
      key: v.key,
      value: decrypt(v.value_encrypted),
      is_secret: v.is_secret,
      updated_at: v.updated_at,
    }));

    logger.info({ userId: req.user.userId, envId: env.id, count: variables.length }, `Fetched ${variables.length} variables`);
    res.json({ variables });
  }
);

router.post(
  '/:companyId/projects/:projectId/environments/:envId/variables',
  requireMember,
  async (req, res) => {
    const { key, value, is_secret } = req.body;
    logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, envId: req.params.envId, key }, 'Creating/updating variable');

    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) {
      logger.warn({ userId: req.user.userId, projectId: req.params.projectId, envId: req.params.envId }, 'Environment not found for variable');
      return res.status(404).json({ error: 'Environment not found' });
    }

    if (!key?.trim() || value === undefined || value === '') {
      logger.warn({ userId: req.user.userId, envId: env.id, key }, 'Variable missing key or value');
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

    if (error) {
      logger.error({ userId: req.user.userId, envId: env.id, key, error: error.message }, 'Failed to save variable');
      return res.status(500).json({ error: error.message });
    }

    logger.info({ userId: req.user.userId, envId: env.id, key, varId: data.id }, 'Variable saved successfully');
    res.status(201).json({
      variable: { id: data.id, key: data.key, value, is_secret: data.is_secret, updated_at: data.updated_at },
    });
  }
);

router.delete(
  '/:companyId/projects/:projectId/environments/:envId/variables/:varId',
  requireMember,
  async (req, res) => {
    logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, envId: req.params.envId, varId: req.params.varId }, 'Deleting variable');

    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) {
      logger.warn({ userId: req.user.userId, projectId: req.params.projectId, envId: req.params.envId }, 'Environment not found for variable deletion');
      return res.status(404).json({ error: 'Environment not found' });
    }

    const { error } = await supabase
      .from('env_variables')
      .delete()
      .eq('id', req.params.varId)
      .eq('environment_id', env.id);

    if (error) {
      logger.error({ userId: req.user.userId, envId: env.id, varId: req.params.varId, error: error.message }, 'Failed to delete variable');
      return res.status(500).json({ error: error.message });
    }

    logger.info({ userId: req.user.userId, envId: env.id, varId: req.params.varId }, 'Variable deleted successfully');
    res.status(204).send();
  }
);

// Bulk import
router.post(
  '/:companyId/projects/:projectId/environments/:envId/variables/bulk',
  requireMember,
  async (req, res) => {
    const { variables } = req.body;
    logger.info({ userId: req.user.userId, companyId: req.params.companyId, projectId: req.params.projectId, envId: req.params.envId, count: variables?.length }, 'Bulk import variables');

    const env = await getCompanyEnvironment(req.params.companyId, req.params.projectId, req.params.envId);
    if (!env) {
      logger.warn({ userId: req.user.userId, projectId: req.params.projectId, envId: req.params.envId }, 'Environment not found for bulk import');
      return res.status(404).json({ error: 'Environment not found' });
    }

    if (!Array.isArray(variables) || variables.length === 0) {
      logger.warn({ userId: req.user.userId, envId: env.id }, 'Bulk import - no variables provided');
      return res.status(400).json({ error: 'No variables to import' });
    }

    const valid = variables.filter((v) => v.key?.trim() && v.value !== undefined && v.value !== '');
    if (valid.length === 0) {
      logger.warn({ userId: req.user.userId, envId: env.id }, 'Bulk import - no valid KEY=VALUE pairs');
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

    if (error) {
      logger.error({ userId: req.user.userId, envId: env.id, error: error.message }, 'Bulk import failed');
      return res.status(500).json({ error: error.message });
    }

    const valueByKey = Object.fromEntries(valid.map((v) => [v.key.trim(), v.value]));
    const resultVariables = data.map((v) => ({
      id: v.id,
      key: v.key,
      value: valueByKey[v.key],
      is_secret: v.is_secret,
      updated_at: v.updated_at,
    }));

    logger.info({ userId: req.user.userId, envId: env.id, imported: resultVariables.length }, `Bulk imported ${resultVariables.length} variables`);
    res.status(201).json({ variables: resultVariables });
  }
);

module.exports = router;