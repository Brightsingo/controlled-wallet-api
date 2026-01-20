// seed.js
const bcrypt = require('bcrypt');
const { query } = require('./db');

async function seed() {
  const hash = await bcrypt.hash('adminpassword', 10);

  await query(`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
  `, ['Admin User', 'admin@example.com', hash, 'ADMIN']);

  console.log('✅ Admin user seeded');
}

seed().catch(err => console.error(err));
