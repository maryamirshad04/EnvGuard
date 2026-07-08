const supabase = require('../config/supabase');

async function getMembership(companyId, userId) {
  const { data, error } = await supabase
    .from('company_members')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

async function requireMember(req, res, next) {
  try {
    const membership = await getMembership(req.params.companyId, req.user.userId);
    if (!membership) return res.status(404).json({ error: 'Company not found' });
    req.membership = membership;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function requireAdmin(req, res, next) {
  if (req.membership?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { getMembership, requireMember, requireAdmin };
