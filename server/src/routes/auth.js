const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const logger = require('../utils/logger'); 
const { maskEmail } = require('../utils/helpers');

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
  const maskedEmail = maskEmail(email);
  logger.info({ email: maskedEmail }, `Signup attempt for ${maskedEmail}`);

  if (!email || !password) {
    logger.warn({ email: maskedEmail }, 'Signup missing fields');
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (password.length < 8) {
    logger.warn({ email: maskedEmail }, 'Signup password too short');
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    logger.warn({ email: maskedEmail }, 'Signup failed - user already exists');
    return res.status(409).json({ error: 'User already exists' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('users')
    .insert({ email, password_hash })
    .select('id, email')
    .single();

  if (error) {
    logger.error({ email: maskedEmail, error: error.message }, 'Signup Supabase insert error');
    return res.status(500).json({ error: error.message });
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: 'My Workspace', created_by: data.id })
    .select()
    .single();

  if (companyError) {
    logger.error({ userId: data.id, error: companyError.message }, 'Failed to create default company');
  } else {
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({ company_id: company.id, user_id: data.id, role: 'admin' });
    if (memberError) {
      logger.error({ userId: data.id, companyId: company.id, error: memberError.message }, 'Failed to add default company membership');
    }
  }

  issueSessionCookie(res, data);
  logger.info({ userId: data.id, email: maskedEmail }, 'User signed up successfully');
  res.status(201).json({ user: data });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const maskedEmail = maskEmail(email);
  logger.info({ email: maskedEmail }, `Login attempt for ${maskedEmail}`);

  if (!email || !password) {
    logger.warn({ email: maskedEmail }, 'Login missing fields');
    return res.status(400).json({ error: 'Missing fields' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) {
    logger.warn({ email: maskedEmail }, 'Login failed - user not found');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    logger.warn({ userId: user.id, email: maskedEmail }, 'Login failed - invalid password');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // If 2FA is on, don't issue the real session yet - hand back a short-lived
  // token that only proves "password already checked", scoped to nothing else.
  if (user.two_factor_enabled) {
    const tempToken = jwt.sign(
      { userId: user.id, purpose: '2fa-pending' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    logger.info({ userId: user.id, email: maskedEmail }, '2FA pending - temp token issued');
    return res.json({ requires2fa: true, tempToken });
  }

  issueSessionCookie(res, { id: user.id, email: user.email });
  logger.info({ userId: user.id, email: maskedEmail }, 'User logged in successfully');
  res.json({ user: { id: user.id, email: user.email } });
});

router.post('/login/2fa', async (req, res) => {
  const { tempToken, code } = req.body;
  logger.info({ hasTempToken: !!tempToken }, '2FA verification attempt');

  if (!tempToken || !code) {
    logger.warn('2FA verification missing fields');
    return res.status(400).json({ error: 'Missing verification code' });
  }

  let payload;
  try {
    payload = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn({ error: err.message }, '2FA temp token invalid/expired');
    return res.status(401).json({ error: 'That verification step expired. Please log in again.' });
  }
  if (payload.purpose !== '2fa-pending') {
    logger.warn({ payloadPurpose: payload.purpose }, '2FA temp token invalid purpose');
    return res.status(401).json({ error: 'Invalid verification token' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, two_factor_secret, two_factor_enabled')
    .eq('id', payload.userId)
    .single();

  if (error || !user || !user.two_factor_enabled || !user.two_factor_secret) {
    logger.warn({ userId: payload.userId, error: error?.message }, '2FA user not properly set up');
    return res.status(401).json({ error: 'Two-factor authentication is not set up for this account' });
  }

  const isValid = authenticator.verify({ token: String(code).trim(), secret: user.two_factor_secret });
  if (!isValid) {
    logger.warn({ userId: user.id, email: maskEmail(user.email) }, '2FA invalid code');
    return res.status(401).json({ error: 'Invalid code. Check your authenticator app and try again.' });
  }

  issueSessionCookie(res, { id: user.id, email: user.email });
  logger.info({ userId: user.id, email: maskEmail(user.email) }, '2FA successful - session issued');
  res.json({ user: { id: user.id, email: user.email } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  logger.info({ ip: req.ip }, 'User logged out');
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  logger.info({ userId: req.user.userId, email: maskEmail(req.user.email) }, 'Session check /me');
  res.json({ user: req.user });
});

router.patch('/email', requireAuth, async (req, res) => {
  const { email } = req.body;
  const newEmailMasked = maskEmail(email);
  logger.info({ userId: req.user.userId, currentEmail: maskEmail(req.user.email), newEmail: newEmailMasked }, 'Email update request');

  if (!email?.trim()) {
    logger.warn({ userId: req.user.userId }, 'Email update missing email');
    return res.status(400).json({ error: 'Email is required' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.trim())
    .neq('id', req.user.userId)
    .single();

  if (existing) {
    logger.warn({ userId: req.user.userId, attemptedEmail: newEmailMasked }, 'Email update - email already in use');
    return res.status(409).json({ error: 'That email is already in use' });
  }

  const { error } = await supabase
    .from('users')
    .update({ email: email.trim() })
    .eq('id', req.user.userId);

  if (error) {
    logger.error({ userId: req.user.userId, error: error.message }, 'Email update Supabase error');
    return res.status(500).json({ error: error.message });
  }

  res.clearCookie('token', COOKIE_OPTIONS);
  logger.info({ userId: req.user.userId, newEmail: newEmailMasked }, 'Email updated - cookie cleared, user must re-login');
  res.json({ message: 'Email updated. Please log in again.' });
});

router.get('/2fa/status', requireAuth, async (req, res) => {
  logger.info({ userId: req.user.userId }, '2FA status check');
  const { data, error } = await supabase
    .from('users')
    .select('two_factor_enabled')
    .eq('id', req.user.userId)
    .single();

  if (error) {
    logger.error({ userId: req.user.userId, error: error.message }, '2FA status Supabase error');
    return res.status(500).json({ error: error.message });
  }
  res.json({ enabled: !!data.two_factor_enabled });
});

router.post('/2fa/setup', requireAuth, async (req, res) => {
  logger.info({ userId: req.user.userId, email: maskEmail(req.user.email) }, '2FA setup started');
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(req.user.email, 'EnvGuard', secret);

  const { error } = await supabase
    .from('users')
    .update({ two_factor_secret: secret, two_factor_enabled: false })
    .eq('id', req.user.userId);

  if (error) {
    logger.error({ userId: req.user.userId, error: error.message }, '2FA setup Supabase error');
    return res.status(500).json({ error: error.message });
  }

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  logger.info({ userId: req.user.userId }, '2FA setup completed - QR generated');
  res.json({ secret, qrCodeDataUrl });
});

router.post('/2fa/verify', requireAuth, async (req, res) => {
  const { code } = req.body;
  logger.info({ userId: req.user.userId }, '2FA verification attempt');

  if (!code) {
    logger.warn({ userId: req.user.userId }, '2FA verify missing code');
    return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('two_factor_secret')
    .eq('id', req.user.userId)
    .single();

  if (error || !user?.two_factor_secret) {
    logger.warn({ userId: req.user.userId, error: error?.message }, '2FA verify - no secret found');
    return res.status(400).json({ error: 'Start setup first before verifying a code' });
  }

  const isValid = authenticator.verify({ token: String(code).trim(), secret: user.two_factor_secret });
  if (!isValid) {
    logger.warn({ userId: req.user.userId }, '2FA verify - invalid code');
    return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ two_factor_enabled: true })
    .eq('id', req.user.userId);

  if (updateError) {
    logger.error({ userId: req.user.userId, error: updateError.message }, '2FA verify - enable update error');
    return res.status(500).json({ error: updateError.message });
  }

  logger.info({ userId: req.user.userId }, '2FA enabled successfully');
  res.json({ enabled: true });
});

router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { password } = req.body;
  logger.info({ userId: req.user.userId }, '2FA disable attempt');

  if (!password) {
    logger.warn({ userId: req.user.userId }, '2FA disable missing password');
    return res.status(400).json({ error: 'Confirm your password to disable two-factor authentication' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.userId)
    .single();

  if (error || !user) {
    logger.error({ userId: req.user.userId, error: error?.message }, '2FA disable - user lookup error');
    return res.status(500).json({ error: 'Could not verify your account' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    logger.warn({ userId: req.user.userId }, '2FA disable - incorrect password');
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ two_factor_enabled: false, two_factor_secret: null })
    .eq('id', req.user.userId);

  if (updateError) {
    logger.error({ userId: req.user.userId, error: updateError.message }, '2FA disable - update error');
    return res.status(500).json({ error: updateError.message });
  }

  logger.info({ userId: req.user.userId }, '2FA disabled successfully');
  res.json({ enabled: false });
});

module.exports = router;