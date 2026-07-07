const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({
    message: `Projects for ${req.user.email}`,
    projects: [],
  });
});

module.exports = router;
