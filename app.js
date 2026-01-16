const express = require('express');
const { query } = require('./db');
const app = express();

app.use(express.json());

// Health check
app.get('/db/health', (req, res) => {
  res.send('Database is RUNNING');
});

// Create a session → RESERVE transaction
app.post('/sessions', async (req, res) => {
  const { facilitator_id, allocated } = req.body;

  const wallet = await query('SELECT id, balance, reserved FROM campaign_wallet LIMIT 1');
  if (!wallet.rows.length) {
    return res.status(500).json({ error: 'Wallet not initialized' });
  }

  const walletId = wallet.rows[0].id;
  const balance = parseFloat(wallet.rows[0].balance);

  if (allocated > balance) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }

  // Update wallet
  await query(
    'UPDATE campaign_wallet SET balance = balance - $1, reserved = reserved + $1 WHERE id=$2',
    [allocated, walletId]
  );

  // Create session tied to wallet
  const session = await query(
    'INSERT INTO sessions (facilitator_id, allocated, spent, status, campaign_wallet_id) VALUES ($1, $2, 0, $3, $4) RETURNING id',
    [facilitator_id, allocated, 'active', walletId]
  );
  const sessionId = session.rows[0].id;

  // Ledger entry: RESERVE
  await query(
    `INSERT INTO transactions (session_id, type, direction, amount, vendor)
     VALUES ($1, 'RESERVE', 'DEBIT', $2, NULL)`,
    [sessionId, allocated]
  );

  res.status(201).json({ message: 'Session created', id: sessionId });
});

// Spend from a session → SPEND transaction
app.post('/sessions/:id/spend', async (req, res) => {
  const { id } = req.params;
  const { amount, vendor } = req.body;

  const session = await query('SELECT allocated, spent, status FROM sessions WHERE id=$1', [id]);
  if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });

  const { allocated, spent, status } = session.rows[0];

  if (status === 'completed') {
    return res.status(403).json({ error: 'Session closed' });
  }

  if (parseFloat(spent) + amount > parseFloat(allocated)) {
    return res.status(400).json({ error: 'Overspend not allowed' });
  }

  // Update session spent
  await query('UPDATE sessions SET spent = spent + $1 WHERE id=$2', [amount, id]);

  // Ledger entry: SPEND
  await query(
    `INSERT INTO transactions (session_id, type, direction, amount, vendor)
     VALUES ($1, 'SPEND', 'DEBIT', $2, $3)`,
    [id, amount, vendor]
  );

  res.status(201).json({ message: 'Transaction recorded' });
});

// Close a session → RELEASE transaction
app.post('/sessions/:id/close', async (req, res) => {
  const { id } = req.params;

  const session = await query('SELECT allocated, spent, status, campaign_wallet_id FROM sessions WHERE id=$1', [id]);
  if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });

  const { allocated, spent, status, campaign_wallet_id } = session.rows[0];

  if (status === 'completed') {
    return res.status(200).json({ message: 'Session already closed' });
  }

  const unused = parseFloat(allocated) - parseFloat(spent);

  if (unused > 0) {
    // Release unused funds
    await query('UPDATE campaign_wallet SET balance = balance + $1, reserved = reserved - $1 WHERE id=$2', [unused, campaign_wallet_id]);

    // Ledger entry: RELEASE
    await query(
      `INSERT INTO transactions (session_id, type, direction, amount, vendor)
       VALUES ($1, 'RELEASE', 'CREDIT', $2, NULL)`,
      [id, unused]
    );
  } else {
    // Fully spent: just clear reserved
    await query('UPDATE campaign_wallet SET reserved = reserved - $1 WHERE id=$2', [allocated, campaign_wallet_id]);
  }

  // Mark session as completed
  await query('UPDATE sessions SET status=$1 WHERE id=$2', ['completed', id]);

  const wallet = await query('SELECT balance, reserved FROM campaign_wallet WHERE id=$1', [campaign_wallet_id]);
  res.status(200).json({ message: 'Session closed', wallet: wallet.rows[0] });
});

// Admin ledger → all transactions
app.get('/admin/ledger', async (req, res) => {
  const result = await query(`
    SELECT id, type, amount, direction, vendor, session_id, created_at
    FROM transactions
    ORDER BY created_at DESC
  `);
  res.json(result.rows);
});

// Session ledger → transactions for one session
app.get('/sessions/:id/transactions', async (req, res) => {
  const { id } = req.params;
  const result = await query(`
    SELECT id, type, amount, direction, vendor, session_id, created_at
    FROM transactions
    WHERE session_id = $1
    ORDER BY created_at DESC
  `, [id]);

  res.json(result.rows);
});

// Admin summary → wallet + totals
app.get('/admin/summary', async (req, res) => {
  const wallet = await query('SELECT balance, reserved FROM campaign_wallet LIMIT 1');
  const totalSpent = await query("SELECT COALESCE(SUM(amount),0) AS total_spent FROM transactions WHERE type='SPEND'");
  const sessionCount = await query('SELECT COUNT(*) AS count FROM sessions');
  const txCount = await query('SELECT COUNT(*) AS count FROM transactions');

  res.json({
    balance: wallet.rows[0].balance,
    reserved: wallet.rows[0].reserved,
    total_spent: totalSpent.rows[0].total_spent,
    session_count: sessionCount.rows[0].count,
    transactions_count: txCount.rows[0].count
  });
});

// Admin reconciliation → compare ledger vs wallet
app.get('/admin/reconcile', async (req, res) => {
  const ledgerNet = await query(`
    SELECT COALESCE(SUM(
      CASE WHEN direction='CREDIT' THEN amount ELSE -amount END
    ),0) AS ledger_net
    FROM transactions t
    JOIN sessions s ON t.session_id = s.id
    WHERE s.campaign_wallet_id = 1
  `);

  const walletTotal = await query(`
    SELECT (balance + reserved) AS wallet_total
    FROM campaign_wallet
    WHERE id=1
  `);

  res.json({
    ledger_net: ledgerNet.rows[0].ledger_net,
    wallet_total: walletTotal.rows[0].wallet_total,
    in_sync: ledgerNet.rows[0].ledger_net === walletTotal.rows[0].wallet_total
  });
});

module.exports = app;
