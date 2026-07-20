const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { requireMember } = require('../middleware/companyAccess');
const { encrypt, decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const router = express.Router();

async function getEnvironmentWithAccess(companyId, projectId, envId, userId) {
  logger.debug({ companyId, projectId, envId, userId }, 'Checking environment access');

  const { data: membership, error: memErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single();

  if (memErr || !membership) {
    logger.debug({ companyId, userId, error: memErr?.message }, 'User not a member of company');
    return null;
  }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .single();

  if (projErr || !project) {
    logger.debug({ companyId, projectId, error: projErr?.message }, 'Project not found in company');
    return null;
  }

  const { data: env, error: envErr } = await supabase
    .from('environments')
    .select('*')
    .eq('id', envId)
    .eq('project_id', project.id)
    .single();

  if (envErr || !env) {
    logger.debug({ projectId, envId, error: envErr?.message }, 'Environment not found in project');
    return null;
  }

  logger.debug({ envId, envName: env.name }, 'Environment access granted');
  return env;
}

router.post('/share', requireAuth, async (req, res) => {
  const { companyId, projectId, environmentId, expiryMinutes = 60, variableKeys } = req.body;
  const userId = req.user.userId;

  logger.info({ userId, companyId, projectId, environmentId, expiryMinutes, variableKeys }, 'Generating share link');

  // Validate expiry
  const minExpiry = 5;
  const maxExpiry = 10080; // 7 days
  if (expiryMinutes < minExpiry || expiryMinutes > maxExpiry) {
    return res.status(400).json({ error: `Expiry must be between ${minExpiry} and ${maxExpiry} minutes` });
  }

  if (!companyId || !projectId || !environmentId) {
    return res.status(400).json({ error: 'companyId, projectId, and environmentId are required' });
  }

  const env = await getEnvironmentWithAccess(companyId, projectId, environmentId, userId);
  if (!env) {
    return res.status(403).json({ error: 'You do not have access to this environment' });
  }

  // Fetch variables
  let query = supabase
    .from('env_variables')
    .select('key, value_encrypted, is_secret')
    .eq('environment_id', env.id)
    .order('key');

  // If specific keys requested, filter by them
  if (Array.isArray(variableKeys) && variableKeys.length > 0) {
    query = query.in('key', variableKeys);
  }

  const { data: variables, error: varErr } = await query;

  if (varErr) {
    logger.error({ userId, envId: env.id, error: varErr.message }, 'Failed to fetch variables for share');
    return res.status(500).json({ error: varErr.message });
  }

  if (!variables || variables.length === 0) {
    return res.status(400).json({ error: 'No variables to share' });
  }

  // Decrypt values
  const decryptedVars = variables.map(v => ({
    key: v.key,
    value: decrypt(v.value_encrypted),
    is_secret: v.is_secret,
  }));

  const payload = JSON.stringify(decryptedVars);
  const encryptedPayload = encrypt(payload);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const { data: link, error: insertErr } = await supabase
    .from('shared_links')
    .insert({
      token,
      encrypted_data: encryptedPayload,
      expires_at: expiresAt.toISOString(),
      viewed: false,
    })
    .select()
    .single();

  if (insertErr) {
    logger.error({ userId, envId: env.id, error: insertErr.message }, 'Failed to store shared link');
    return res.status(500).json({ error: insertErr.message });
  }

  const shareUrl = `${process.env.CLIENT_URL}/share/${token}`;

  logger.info({ userId, envId: env.id, token: token.substring(0, 8) + '...' }, 'Share link generated');
  res.status(201).json({ url: shareUrl });
});

router.get('/share/:token', async (req, res) => {
  const { token } = req.params;
  logger.info({ token: token.substring(0, 8) + '...' }, 'Fetching shared link');

  const { data: link, error: findErr } = await supabase
    .from('shared_links')
    .select('*')
    .eq('token', token)
    .single();

  if (findErr || !link) {
    logger.warn({ token: token.substring(0, 8) + '...' }, 'Shared link not found');
    return res.status(404).json({ error: 'Link not found' });
  }

  if (new Date(link.expires_at) < new Date()) {
    logger.warn({ linkId: link.id, expiresAt: link.expires_at }, 'Shared link expired');
    // Optionally delete expired links
    await supabase.from('shared_links').delete().eq('id', link.id);
    return res.status(410).json({ error: 'This link has expired' });
  }

  if (link.viewed) {
    logger.warn({ linkId: link.id }, 'Shared link already viewed');
    return res.status(410).json({ error: 'This link has already been viewed' });
  }

  await supabase
    .from('shared_links')
    .update({ viewed: true })
    .eq('id', link.id);

  let decrypted;
  try {
    const decryptedPayload = decrypt(link.encrypted_data);
    decrypted = JSON.parse(decryptedPayload);
  } catch (e) {
    logger.error({ linkId: link.id, error: e.message }, 'Failed to decrypt shared link data');
    return res.status(500).json({ error: 'Failed to decrypt data' });
  }

  logger.info({ linkId: link.id, varCount: decrypted.length }, 'Shared link retrieved successfully');
  res.json({ variables: decrypted });
});

module.exports = router;