const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Get available roles
router.get('/', authenticate, authorize('admin'), (req, res) => {
  res.json([
    { value: 'security', label: 'Security', description: 'Manages visitor check-in and check-out' },
    { value: 'manager', label: 'Manager', description: 'Reviews visitor meetings and status' },
    { value: 'hr', label: 'HR', description: 'Manages HR-related visitor interactions' }
  ]);
});

module.exports = router;
