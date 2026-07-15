const supabase = require('../config/supabase');
const logger = require('../utils/logger');

async function getMembership(companyId, userId) {
  logger.debug(
    { companyId, userId },
    `Fetching membership for user ${userId} in company ${companyId}`
  );

  try {
    const { data, error } = await supabase
      .from('company_members')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error(
        { companyId, userId, error: error.message },
        `Supabase error fetching membership`
      );
      return null;
    }

    if (!data) {
      logger.info(
        { companyId, userId },
        `No membership found for user ${userId} in company ${companyId}`
      );
      return null;
    }

    logger.debug(
      { companyId, userId, role: data.role },
      `Membership found for user ${userId} in company ${companyId}`
    );
    return data;
  } catch (err) {
    logger.error(
      { companyId, userId, error: err.message, stack: err.stack },
      `Unexpected error in getMembership`
    );
    return null;
  }
}

async function requireMember(req, res, next) {
  const companyId = req.params.companyId;
  const userId = req.user?.userId;

  if (!userId) {
    logger.warn(
      { companyId, path: req.path, ip: req.ip },
      'requireMember called without userId in req.user'
    );
    return res.status(401).json({ error: 'Unauthorized: missing user ID' });
  }

  logger.info(
    { companyId, userId, path: req.path },
    `Checking membership for user ${userId} in company ${companyId}`
  );

  try {
    const membership = await getMembership(companyId, userId);
    if (!membership) {
      logger.warn(
        { companyId, userId, path: req.path },
        `User ${userId} is not a member of company ${companyId}`
      );
      return res.status(404).json({ error: 'Company not found' });
    }

    req.membership = membership;
    logger.info(
      { companyId, userId, role: membership.role },
      `User ${userId} is a member of company ${companyId} with role ${membership.role}`
    );
    next();
  } catch (err) {
    logger.error(
      { companyId, userId, error: err.message, stack: err.stack },
      `Failed to check membership for user ${userId} in company ${companyId}`
    );
    res.status(500).json({ error: err.message });
  }
}

function requireAdmin(req, res, next) {
  const membership = req.membership;
  const userId = req.user?.userId;
  const companyId = req.params.companyId;

  if (!membership) {
    logger.warn(
      { companyId, userId, path: req.path },
      'requireAdmin called without membership object (requireMember must run first)'
    );
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (membership.role !== 'admin') {
    logger.warn(
      { companyId, userId, role: membership.role, path: req.path },
      `User ${userId} has role '${membership.role}' - admin access denied`
    );
    return res.status(403).json({ error: 'Admin access required' });
  }

  logger.info(
    { companyId, userId, path: req.path },
    `User ${userId} has admin access to company ${companyId}`
  );
  next();
}

module.exports = { getMembership, requireMember, requireAdmin };