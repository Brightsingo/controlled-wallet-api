// routes/receipts.js
const express = require('express');
const { query } = require('../db');
const { verifyToken } = require('../src/middleware/auth');

const router = express.Router();

/**
 * GET /api/receipts/transaction/:transaction_id
 * Get receipt for a transaction
 */
router.get('/receipts/transaction/:transaction_id', verifyToken, async (req, res) => {
  try {
    const transactionId = parseInt(req.params.transaction_id);
    const userId = req.user.user_id;
    const userRole = req.user.role;

    let queryStr = `
      SELECT r.*, t.*, v.name as vendor_name, s.facilitator_id
      FROM receipts r
      JOIN transactions t ON r.transaction_id = t.id
      LEFT JOIN vendors v ON t.vendor_id = v.id
      LEFT JOIN sessions s ON t.session_id = s.id
      WHERE r.transaction_id = $1
    `;

    const params = [transactionId];

    // If user is not admin, restrict to their sessions
    if (userRole !== 'ADMIN') {
      queryStr += ` AND s.facilitator_id = $2`;
      params.push(userId);
    }

    const result = await query(queryStr, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'Receipt not found or you are not authorized to view it' 
      });
    }

    res.json({
      success: true,
      data: {
        receipt: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get receipt error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to fetch receipt' 
    });
  }
});

/**
 * GET /api/receipts/session/:session_id
 * Get all receipts for a session
 */
router.get('/receipts/session/:session_id', verifyToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.session_id);
    const userId = req.user.user_id;
    const userRole = req.user.role;

    let queryStr = `
      SELECT r.*, t.*, v.name as vendor_name, s.facilitator_id
      FROM receipts r
      JOIN transactions t ON r.transaction_id = t.id
      LEFT JOIN vendors v ON t.vendor_id = v.id
      LEFT JOIN sessions s ON t.session_id = s.id
      WHERE t.session_id = $1 AND t.type = 'SPEND'
    `;

    const params = [sessionId];

    // If user is not admin, restrict to their sessions
    if (userRole !== 'ADMIN') {
      queryStr += ` AND s.facilitator_id = $2`;
      params.push(userId);
    }

    queryStr += ' ORDER BY r.uploaded_at DESC';

    const result = await query(queryStr, params);

    if (result.rows.length === 0 && params.length > 1) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'No receipts found or you are not authorized to view this session' 
      });
    }

    res.json({
      success: true,
      data: {
        receipts: result.rows,
        count: result.rowCount
      }
    });
  } catch (error) {
    console.error('Get session receipts error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to fetch receipts' 
    });
  }
});

/**
 * POST /api/receipts
 * Upload a new receipt (primarily used by the spend endpoint)
 * This is a helper endpoint for direct receipt uploads if needed
 */
router.post('/receipts', verifyToken, async (req, res) => {
  try {
    const { transaction_id, file_url } = req.body;

    if (!transaction_id || !file_url) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Transaction ID and file URL are required' 
      });
    }

    // Check if receipt already exists for this transaction
    const existingResult = await query(
      'SELECT id FROM receipts WHERE transaction_id = $1',
      [transaction_id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Validation failed',
        details: 'Receipt already exists for this transaction' 
      });
    }

    // Verify transaction exists and user has access
    const transactionResult = await query(
      `SELECT t.id, s.facilitator_id
       FROM transactions t
       LEFT JOIN sessions s ON t.session_id = s.id
       WHERE t.id = $1`,
      [transaction_id]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'Transaction not found' 
      });
    }

    const transaction = transactionResult.rows[0];

    // Check authorization (admin can upload for any, trainers only for their sessions)
    if (req.user.role !== 'ADMIN' && transaction.facilitator_id !== req.user.user_id) {
      return res.status(403).json({ 
        error: 'Access denied',
        details: 'You are not authorized to upload receipts for this transaction' 
      });
    }

    const result = await query(
      `INSERT INTO receipts (transaction_id, file_url, uploaded_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       RETURNING *`,
      [transaction_id, file_url]
    );

    res.status(201).json({
      success: true,
      message: 'Receipt uploaded successfully',
      data: {
        receipt: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to upload receipt' 
    });
  }
});

module.exports = router;