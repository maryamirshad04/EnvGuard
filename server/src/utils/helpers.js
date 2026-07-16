function maskEmail(email) {
  if (!email) return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  if (local.length <= 3) {
    return '***' + domain;
  }
  return local.substring(0, 3) + '***' + domain;
}

module.exports = { maskEmail };