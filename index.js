const express = require('express');
const { healthCheck, query } = require('./db');

const app = express();
const port = process.env.PORT || 3001;

app.get('/db/health', async (req, res) => {
    res.send('Database is RUNNING');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 



