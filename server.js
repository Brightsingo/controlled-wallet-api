const express = require('express');
const { query } = require('./db');

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/db/health', async (req, res) => {
  res.send('Database is RUNNING');
});

// GET recent pings
app.get('/pings', async (req, res) => {
  try {
    const r = await query('SELECT id, message, created_at FROM pings ORDER BY created_at DESC LIMIT 10');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Query failed', details: e.message });
  }
});

// POST new ping
app.post('/pings', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sql = 'INSERT INTO pings (message) VALUES ($1) RETURNING id, message, created_at';
    const result = await query(sql, [message]);

    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Insert failed', details: e.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
