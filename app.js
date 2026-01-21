// app.js - Remove the 404 handler from this file
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('./db');

// Import middleware correctly
const { verifyToken, requireRole } = require('./src/middleware/auth');

// Import routers
const vendorsRouter = require('./routes/vendors');
const receiptsRouter = require('./routes/receipts');

const app = express();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Email and password are required' 
      });
    }

    const result = await query(
      'SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid credentials' 
      });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid credentials' 
      });
    }

    const tokenPayload = { 
      user_id: user.id, 
      role: user.role,
      email: user.email,
      name: user.full_name
    };
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN 
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: 'Internal server error'
    });
  }
});

// Session endpoints
app.post('/sessions', verifyToken, requireRole('ADMIN'), async (req, res) => {
  // ... keep your existing session creation code
});

app.post('/sessions/:id/spend', verifyToken, requireRole('TRAINER'), async (req, res) => {
  // ... keep your existing spend code
});

app.post('/sessions/:id/close', verifyToken, requireRole('ADMIN'), async (req, res) => {
  // ... keep your existing close session code
});

app.get('/sessions/:id/transactions', verifyToken, async (req, res) => {
  // ... keep your existing transactions code
});

// Admin endpoints
app.get('/admin/ledger', verifyToken, requireRole('ADMIN'), async (req, res) => {
  // ... keep your existing ledger code
});

app.get('/admin/summary', verifyToken, requireRole('ADMIN'), async (req, res) => {
  // ... keep your existing summary code
});

// Mount vendor and receipt routers
app.use('/api', vendorsRouter);
app.use('/api', receiptsRouter);

// Serve uploaded receipt files
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/db/health', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as timestamp, version() as version');
    
    res.json({
      status: 'OK',
      message: 'Database is RUNNING',
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Controlled Wallet API',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// Export the app
module.exports = app;