require('dotenv').config();
const { Pool } = require('pg');
console.log('Connecting to:', process.env.DATABASE_URL);
console.log('DATABASE_URL:', process.env.DATABASE_URL);



const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function healthCheck() {
  const r = await pool.query('SELECT 1 AS ok');
  return r.rows[0].ok === 1;
}

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, healthCheck, query };
