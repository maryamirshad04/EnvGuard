const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function issueSessionCookie(res, user) {
  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.cookie('token', token, COOKIE_OPTIONS);
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) return res.status(409).json({ error: 'User already exists' });

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({ email, password_hash })
    .select('id, email')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Every new user gets a default company workspace, as its admin.
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: 'My Workspace', created_by: data.id })
    .select()
    .single();

  if (companyError) {
    console.error('Failed to create default company:', companyError);
  } else {
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({ company_id: company.id, user_id: data.id, role: 'admin' });
    if (memberError) console.error('Failed to add default company membership:', memberError);
  }

  issueSessionCookie(res, data);
  res.status(201).json({ user: data });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // If 2FA is on, don't issue the real session yet - hand back a short-lived
  // token that only proves "password already checked", scoped to nothing else.
  if (user.two_factor_enabled) {
    const tempToken = jwt.sign(
      { userId: user.id, purpose: '2fa-pending' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ requires2fa: true, tempToken });
  }

  issueSessionCookie(res, { id: user.id, email: user.email });
  res.json({ user: { id: user.id, email: user.email } });
});

router.post('/login/2fa', async (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ error: 'Missing verification code' });
  }

  let payload;
  try {
    payload = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'That verification step expired. Please log in again.' });
  }
  if (payload.purpose !== '2fa-pending') {
    return res.status(401).json({ error: 'Invalid verification token' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, two_factor_secret, two_factor_enabled')
    .eq('id', payload.userId)
    .single();

  if (error || !user || !user.two_factor_enabled || !user.two_factor_secret) {
    return res.status(401).json({ error: 'Two-factor authentication is not set up for this account' });
  }

  const isValid = authenticator.verify({ token: String(code).trim(), secret: user.two_factor_secret });
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid code. Check your authenticator app and try again.' });
  }

  issueSessionCookie(res, { id: user.id, email: user.email });
  res.json({ user: { id: user.id, email: user.email } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- account settings: email + two-factor authentication --------------------

router.patch('/email', requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.trim())
    .neq('id', req.user.userId)
    .single();
  if (existing) return res.status(409).json({ error: 'That email is already in use' });

  const { error } = await supabase
    .from('users')
    .update({ email: email.trim() })
    .eq('id', req.user.userId);

  if (error) return res.status(500).json({ error: error.message });

  // The session cookie's JWT carries the old email as a claim - clearing it
  // here forces a fresh login (and a fresh token with the new email) instead
  // of leaving the app running on stale claims until the cookie expires.
  res.clearCookie('token', COOKIE_OPTIONS);
  res.json({ message: 'Email updated. Please log in again.' });
});

router.get('/2fa/status', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('two_factor_enabled')
    .eq('id', req.user.userId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ enabled: !!data.two_factor_enabled });
});

router.post('/2fa/setup', requireAuth, async (req, res) => {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(req.user.email, 'EnvGuard', secret);

  const { error } = await supabase
    .from('users')
    .update({ two_factor_secret: secret, two_factor_enabled: false })
    .eq('id', req.user.userId);

  if (error) return res.status(500).json({ error: error.message });

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret, qrCodeDataUrl });
});

router.post('/2fa/verify', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });

  const { data: user, error } = await supabase
    .from('users')
    .select('two_factor_secret')
    .eq('id', req.user.userId)
    .single();

  if (error || !user?.two_factor_secret) {
    return res.status(400).json({ error: 'Start setup first before verifying a code' });
  }

  const isValid = authenticator.verify({ token: String(code).trim(), secret: user.two_factor_secret });
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ two_factor_enabled: true })
    .eq('id', req.user.userId);

  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json({ enabled: true });
});

router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Confirm your password to disable two-factor authentication' });

  const { data: user, error } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.userId)
    .single();

  if (error || !user) return res.status(500).json({ error: 'Could not verify your account' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  const { error: updateError } = await supabase
    .from('users')
    .update({ two_factor_enabled: false, two_factor_secret: null })
    .eq('id', req.user.userId);

  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json({ enabled: false });
});

module.exports = router;