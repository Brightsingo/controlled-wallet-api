
const { query } = require('../db');

beforeEach(async () => {
  // Reset tables safely without violating immutability triggers
  await query('TRUNCATE transactions RESTART IDENTITY CASCADE');
  await query('TRUNCATE sessions RESTART IDENTITY CASCADE');
  await query('TRUNCATE campaign_wallet RESTART IDENTITY CASCADE');

  // Seed wallet with initial balance
  await query('INSERT INTO campaign_wallet (id, balance, reserved) VALUES (1, 10000, 0)');
});

console.log('✅ Test environment loaded');
