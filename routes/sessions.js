const express = require('express');
const router = express.Router();

// Import middleware
const { verifyToken, authorize } = require('../middleware/auth');
const { validateSessionAccess } = require('../middleware/sessions');

// Import controllers
const {
  getSessions,
  getSession,
  createSession,
  spendFromSession,
  getSessionTransactions,
  closeSession
} = require('../controllers/sessions');

// ====================
// MIDDLEWARE COMPOSITION
// ====================

// Common middleware combinations
const auth = verifyToken;
const authTrainerAdmin = [auth, authorize('trainer', 'admin')];
const authAllRoles = [auth, authorize('trainer', 'admin', 'trainee')];
const withSessionAccess = [auth, validateSessionAccess];
const trainerAdminWithSession = [...withSessionAccess, authorize('trainer', 'admin')];

// ====================
// ROUTE DEFINITIONS
// ====================

// Collection routes
router.get('/', ...authAllRoles, getSessions);
router.post('/', ...authTrainerAdmin, createSession);

// Session-specific routes
router.get('/:sessionId', ...withSessionAccess, getSession);
router.post('/:sessionId/close', ...trainerAdminWithSession, closeSession);

// Transaction routes
router.post('/:sessionId/spend', ...trainerAdminWithSession, spendFromSession);
router.get('/:sessionId/transactions', ...withSessionAccess, getSessionTransactions);

module.exports = router;