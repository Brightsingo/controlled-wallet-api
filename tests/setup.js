const { query } = require('../db');

beforeEach(async () => {
  // Reset tables safely without violating immutability triggers
  await query('TRUNCATE transactions RESTART IDENTITY CASCADE');
  await query('TRUNCATE sessions RESTART IDENTITY CASCADE');
  await query('TRUNCATE campaign_wallet RESTART IDENTITY CASCADE');
  await query('TRUNCATE users RESTART IDENTITY CASCADE');

  // Seed wallet with initial balance
  await query('INSERT INTO campaign_wallet (id, balance, reserved) VALUES (1, 10000, 0)');

  // Seed a trainer user so facilitator_id references are valid
  await query(`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES ('Test Trainer', 'trainer@example.com', 'hashedpassword', 'TRAINER')
  `);
});

console.log('✅ Test environment loaded');
