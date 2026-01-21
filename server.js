// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Import and use the main app
const mainApp = require('./app');
app.use('/', mainApp);

// 404 Handler - FIXED: Use proper 404 handling
app.use((req, res) => {
  res.status(404).json({
    status: 'ERROR',
    message: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    suggestions: [
      'Check the endpoint URL',
      'Verify the HTTP method (GET, POST, etc.)',
      'Available endpoints: GET /, POST /auth/login, POST /sessions, etc.'
    ]
  });
});

// Error Handling Middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });

  const statusCode = error.statusCode || 500;
  const errorResponse = {
    status: 'ERROR',
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = error.message;
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Server time: ${new Date().toISOString()}`);
  console.log('\n📋 Available Endpoints:');
  console.log('   GET  /                 - System information');
  console.log('   POST /auth/login       - User authentication');
  console.log('   POST /sessions         - Create session (Admin only)');
  console.log('   POST /sessions/:id/spend - Spend from session (Trainer only)');
  console.log('   GET  /sessions/:id/transactions - Get session transactions');
  console.log('   POST /sessions/:id/close - Close session (Admin only)');
  console.log('   GET  /admin/ledger     - View all transactions (Admin only)');
  console.log('   GET  /admin/summary    - System summary (Admin only)');
  console.log('   GET  /api/vendors      - Manage vendors (Admin only)');
  console.log('   GET  /db/health        - Health check');
  console.log('\n👤 Default Users:');
  console.log('   Admin:  admin@example.com / admin123');
  console.log('   Trainer: trainer@example.com / trainer123');
});