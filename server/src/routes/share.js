const express = require('express');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { requireMember } = require('../middleware/companyAccess'); // ensure user is member of the company
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

// Helper: get environment with company/project checks
async function getEnvironmentWithAccess(companyId, projectId, envId, userId) {
  // First verify that the user is a member of the company
  const { data: membership, error: memErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single();

  if (memErr || !membership) return null;

  // Then get the project and environment
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .single();

  if (projErr || !project) return null;

  const { data: env, error: envErr } = await supabase
    .from('environments')
    .select('*')
    .eq('id', envId)
    .eq('project_id', project.id)
    .single();

  if (envErr || !env) return null;

  return env;
}

// Generate a share link (requires authentication and membership)
router.post('/share', requireAuth, async (req, res) => {
  const { companyId, projectId, environmentId } = req.body;

  if (!companyId || !projectId || !environmentId) {
    return res.status(400).json({ error: 'companyId, projectId, and environmentId are required' });
  }

  // Verify access and get environment
  const env = await getEnvironmentWithAccess(companyId, projectId, environmentId, req.user.userId);
  if (!env) {
    return res.status(403).json({ error: 'You do not have access to this environment' });
  }

  // Fetch all variables for this environment
  const { data: variables, error: varErr } = await supabase
    .from('env_variables')
    .select('key, value_encrypted, is_secret')
    .eq('environment_id', env.id)
    .order('key');

  if (varErr) {
    return res.status(500).json({ error: varErr.message });
  }

  // Decrypt the values (so the link contains plaintext values)
  const decryptedVars = variables.map(v => ({
    key: v.key,
    value: decrypt(v.value_encrypted),
    is_secret: v.is_secret,
  }));

  // Encrypt the whole payload as JSON
  const payload = JSON.stringify(decryptedVars);
  const encryptedPayload = encrypt(payload);

  // Generate a random token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  // Store in the database
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
    return res.status(500).json({ error: insertErr.message });
  }

  // Build the share URL (using CLIENT_URL from env)
  const shareUrl = `${process.env.CLIENT_URL}/share/${token}`;

  res.status(201).json({ url: shareUrl });
});

// Retrieve a shared link (no authentication required)
router.get('/share/:token', async (req, res) => {
  const { token } = req.params;

  // Fetch the link record
  const { data: link, error: findErr } = await supabase
    .from('shared_links')
    .select('*')
    .eq('token', token)
    .single();

  if (findErr || !link) {
    return res.status(404).json({ error: 'Link not found' });
  }

  // Check expiry
  if (new Date(link.expires_at) < new Date()) {
    // Optionally delete expired links
    await supabase.from('shared_links').delete().eq('id', link.id);
    return res.status(410).json({ error: 'This link has expired' });
  }

  // Check if already viewed
  if (link.viewed) {
    return res.status(410).json({ error: 'This link has already been viewed' });
  }

  // Mark as viewed
  await supabase
    .from('shared_links')
    .update({ viewed: true })
    .eq('id', link.id);

  // Decrypt the data
  let decrypted;
  try {
    const decryptedPayload = decrypt(link.encrypted_data);
    decrypted = JSON.parse(decryptedPayload);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to decrypt data' });
  }

  res.json({ variables: decrypted });
});

module.exports = router;