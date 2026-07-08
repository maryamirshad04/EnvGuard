const express = require('express');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /api/invites/:token
router.get('/:token', async (req, res) => {
  const { data: invite, error } = await supabase
    .from('invites')
    .select('id, email, role, status, expires_at, companies(name)')
    .eq('token', req.params.token)
    .single();

  if (error || !invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite is no longer valid' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invite has expired' });
  }

  res.json({
    invite: {
      email: invite.email,
      role: invite.role,
      companyName: invite.companies?.name,
    },
  });
});

// POST /api/invites/:token/accept
router.post('/:token/accept', requireAuth, async (req, res) => {
  const { data: invite, error } = await supabase
    .from('invites')
    .select('*')
    .eq('token', req.params.token)
    .single();

  if (error || !invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite is no longer valid' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invite has expired' });
  }
  if (invite.email !== req.user.email.toLowerCase()) {
    return res.status(403).json({
      error: `This invite was sent to ${invite.email}. Log in with that email to accept it.`,
    });
  }

  const { error: memberError } = await supabase
    .from('company_members')
    .upsert(
      { company_id: invite.company_id, user_id: req.user.userId, role: invite.role },
      { onConflict: 'company_id,user_id' }
    );

  if (memberError) return res.status(500).json({ error: memberError.message });

  await supabase.from('invites').update({ status: 'accepted' }).eq('id', invite.id);

  res.json({ companyId: invite.company_id });
});

module.exports = router;
