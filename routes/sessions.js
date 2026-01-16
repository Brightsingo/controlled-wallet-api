
const express = require('express');
const { query } = require('../db');
const router = express.Router();

router.post('/:id/spend', async (req, res) => {
  const { id } = req.params;
  const { amount, vendor } = req.body;

  try {
    const session = await query('SELECT allocated, spent FROM sessions WHERE id=$1', [id]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });

    const { allocated, spent } = session.rows[0];
    if (spent + amount > allocated) {
      return res.status(400).json({ error: 'Overspend not allowed' });
    }

    await query('INSERT INTO transactions (session_id, amount, vendor) VALUES ($1,$2,$3)', [id, amount, vendor]);
    await query('UPDATE sessions SET spent = spent + $1 WHERE id=$2', [amount, id]);

    res.status(201).json({ message: 'Transaction recorded' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process spend', details: e.message });
  }
});

module.exports = router;
