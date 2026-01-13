const express = require('express');
const { healthCheck, query } = require('./db');

const app = express();
const port = process.env.PORT || 3001;

app.get('/db/health', async (req, res) => {
    res.send('Database is RUNNING');
});

app.get('/pings', async (req, res) => {
  try {
    const r = await query('SELECT id, message, created_at FROM pings ORDER BY created_at DESC LIMIT 10');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Query failed', details: e.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 
