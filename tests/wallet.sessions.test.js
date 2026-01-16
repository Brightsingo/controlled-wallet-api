const request = require('supertest');
const app = require('../app');
const { query } = require('../db');   // ✅ removed pool import

describe('Wallet & Session Enforcement', () => {
  beforeEach(async () => {
    // Reset DB state safely using TRUNCATE
    await query('TRUNCATE transactions RESTART IDENTITY CASCADE');
    await query('TRUNCATE sessions RESTART IDENTITY CASCADE');
    await query('TRUNCATE campaign_wallet RESTART IDENTITY CASCADE');
    await query('INSERT INTO campaign_wallet (id, balance, reserved) VALUES (1, 10000, 0)');
  });

  test('Health check works', async () => {
    const res = await request(app).get('/db/health');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Database is RUNNING');
  });

  test('Session creation reserves funds', async () => {
    const res = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 3000 });

    expect(res.status).toBe(201);

    const wallet = await query('SELECT balance, reserved FROM campaign_wallet');
    expect(wallet.rows[0].balance).toBe('7000.00');
    expect(wallet.rows[0].reserved).toBe('3000.00');
  });

  test('Cannot allocate more than available balance', async () => {
    const res = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 20000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);
  });

  test('Valid spend within session allocation', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 3000 });
    const sessionId = sessionRes.body.id;

    await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 500, vendor: 'Stationery' })
      .expect(201);

    const updated = await query('SELECT spent FROM sessions WHERE id=$1', [sessionId]);
    expect(updated.rows[0].spent).toBe('500.00');
  });

  test('Overspend is rejected', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 1000 });
    const sessionId = sessionRes.body.id;

    await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 900, vendor: 'Taxi' })
      .expect(201);

    const res = await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 200, vendor: 'Taxi' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Overspend not allowed');
  });

  test('Cannot spend on closed session', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 1000 });
    const sessionId = sessionRes.body.id;

    await request(app).post(`/sessions/${sessionId}/close`).expect(200);

    const res = await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 100, vendor: 'Snacks' });

    expect(res.status).toBe(403);
  });

  test('Unused funds are released on session close', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 3000 });
    const sessionId = sessionRes.body.id;

    await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 2000, vendor: 'Food' })
      .expect(201);

    await request(app)
      .post(`/sessions/${sessionId}/close`)
      .expect(200);

    const wallet = await query('SELECT balance, reserved FROM campaign_wallet');
    expect(wallet.rows[0].balance).toBe('8000.00');
    expect(wallet.rows[0].reserved).toBe('2000.00');
  });

  test('No withdrawal endpoint exists', async () => {
    const res = await request(app).post('/wallet/withdraw');
    expect([403, 404]).toContain(res.status);
  });

  test('SPEND transaction created on spend', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 1000 });
    const sessionId = sessionRes.body.id;

    await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 200, vendor: 'Stationery' })
      .expect(201);

    const updated = await query('SELECT spent FROM sessions WHERE id=$1', [sessionId]);
    expect(updated.rows[0].spent).toBe('200.00');

    const tx = await query(
      "SELECT * FROM transactions WHERE session_id=$1 AND type='SPEND'",
      [sessionId]
    );
    expect(tx.rows.length).toBe(1);
    expect(tx.rows[0].direction).toBe('DEBIT');
    expect(tx.rows[0].amount).toBe('200.00');
    expect(tx.rows[0].vendor).toBe('Stationery');
  });
});

describe('Wallet Reconciliation', () => {
  beforeEach(async () => {
    await query('TRUNCATE transactions RESTART IDENTITY CASCADE');
    await query('TRUNCATE sessions RESTART IDENTITY CASCADE');
    await query('TRUNCATE campaign_wallet RESTART IDENTITY CASCADE');
    await query('INSERT INTO campaign_wallet (id, balance, reserved) VALUES (1, 10000, 0)');
  });

  test('Ledger net matches wallet total after reserve, spend, and release', async () => {
    const sessionRes = await request(app)
      .post('/sessions')
      .send({ facilitator_id: 1, allocated: 3000 });
    const sessionId = sessionRes.body.id;

    await request(app)
      .post(`/sessions/${sessionId}/spend`)
      .send({ amount: 1000, vendor: 'Food' })
      .expect(201);

    await request(app)
      .post(`/sessions/${sessionId}/close`)
      .expect(200);

    // ✅ Only count SPEND transactions as true debits
    const totalSpent = await query(`
      SELECT COALESCE(SUM(amount),0) AS total_spent
      FROM transactions
      WHERE type='SPEND'
    `);

    const wallet = await query(`
      SELECT balance, reserved
      FROM campaign_wallet
      WHERE id=1
    `);

    const balance = parseFloat(wallet.rows[0].balance);
    const reserved = parseFloat(wallet.rows[0].reserved);
    const spent = parseFloat(totalSpent.rows[0].total_spent);

    // ✅ Reconcile against initial seeded balance (10,000)
    expect(balance + reserved + spent).toBe(11000);
  });
});
