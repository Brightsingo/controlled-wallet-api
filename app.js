// app.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Health check
app.get('/db/health', (req, res) => {
  res.status(200).send('Database is RUNNING');
});

// Auth login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { user_id: user.id, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({ token, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin-only: create session
app.post('/sessions', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { facilitator_id, allocated } = req.body;
    if (allocated == null || isNaN(Number(allocated))) return res.status(400).json({ error: 'Invalid allocated amount' });

    const walletRes = await query('SELECT id, balance, reserved FROM campaign_wallet LIMIT 1');
    if (!walletRes.rows.length) return res.status(500).json({ error: 'Wallet not initialized' });

    const wallet = walletRes.rows[0];
    const balance = parseFloat(wallet.balance);

    if (Number(allocated) > balance) return res.status(400).json({ error: 'Insufficient funds' });

    await query('UPDATE campaign_wallet SET balance = (balance - $1)::numeric, reserved = (reserved + $1)::numeric WHERE id=$2', [allocated, wallet.id]);

    const sessionRes = await query(
      'INSERT INTO sessions (facilitator_id, allocated, spent, status, campaign_wallet_id) VALUES ($1, $2, 0, $3, $4) RETURNING id',
      [facilitator_id, allocated, 'active', wallet.id]
    );
    const sessionId = sessionRes.rows[0].id;

    await query(
      'INSERT INTO transactions (session_id, type, direction, amount, vendor) VALUES ($1, $2, $3, $4, $5)',
      [sessionId, 'RESERVE', 'DEBIT', allocated, null]
    );

    return res.status(201).json({ id: sessionId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// Trainer-only: spend
app.post('/sessions/:id/spend', verifyToken, requireRole('TRAINER'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, vendor } = req.body;
    if (amount == null || isNaN(Number(amount))) return res.status(400).json({ error: 'Invalid amount' });

    const sessionRes = await query('SELECT facilitator_id, allocated, spent, status FROM sessions WHERE id=$1', [id]);
    if (!sessionRes.rows.length) return res.status(404).json({ error: 'Session not found' });

    const session = sessionRes.rows[0];

    if (session.facilitator_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden: not your session' });
    if (session.status === 'completed') return res.status(403).json({ error: 'Session closed' });

    const newSpent = parseFloat(session.spent) + Number(amount);
    if (newSpent > parseFloat(session.allocated)) return res.status(400).json({ error: 'Overspend not allowed' });

    await query('UPDATE sessions SET spent = (spent + $1)::numeric WHERE id=$2', [amount, id]);

    await query(
      'INSERT INTO transactions (session_id, type, direction, amount, vendor) VALUES ($1, $2, $3, $4, $5)',
      [id, 'SPEND', 'DEBIT', amount, vendor]
    );

    return res.status(201).json({ message: 'Transaction recorded' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to record spend' });
  }
});

// Admin-only: close session
app.post('/sessions/:id/close', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const sessionRes = await query('SELECT allocated, spent, status, campaign_wallet_id FROM sessions WHERE id=$1', [id]);
    if (!sessionRes.rows.length) return res.status(404).json({ error: 'Session not found' });

    const session = sessionRes.rows[0];
    if (session.status === 'completed') return res.status(200).json({ message: 'Session already closed' });

    const unused = parseFloat(session.allocated) - parseFloat(session.spent);
    if (unused > 0) {
      await query('UPDATE campaign_wallet SET balance = (balance + $1)::numeric, reserved = (reserved - $1)::numeric WHERE id=$2', [unused, session.campaign_wallet_id]);
      await query('INSERT INTO transactions (session_id, type, direction, amount, vendor) VALUES ($1, $2, $3, $4, $5)', [id, 'RELEASE', 'CREDIT', unused, null]);
    } else {
      await query('UPDATE campaign_wallet SET reserved = (reserved - $1)::numeric WHERE id=$2', [session.allocated, session.campaign_wallet_id]);
    }

    await query('UPDATE sessions SET status=$1 WHERE id=$2', ['completed', id]);

    return res.status(200).json({ message: 'Session closed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to close session' });
  }
});

// Admin-only: ledger
app.get('/admin/ledger', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await query('SELECT id, type, amount, direction, vendor, session_id, created_at FROM transactions ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

// Admin-only: summary
app.get('/admin/summary', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const wallet = await query('SELECT balance, reserved FROM campaign_wallet LIMIT 1');
    const totalSpent = await query("SELECT COALESCE(SUM(amount),0) AS total_spent FROM transactions WHERE type='SPEND'");
    const sessionCount = await query('SELECT COUNT(*) AS count FROM sessions');
    const txCount = await query('SELECT COUNT(*) AS count FROM transactions');

    return res.json({
      balance: wallet.rows[0]?.balance ?? '0.00',
      reserved: wallet.rows[0]?.reserved ?? '0.00',
      total_spent: totalSpent.rows[0].total_spent,
      session_count: sessionCount.rows[0].count,
      transactions_count: txCount.rows[0].count
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

module.exports = app;
