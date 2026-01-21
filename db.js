// db.js
const { Pool } = require('pg');
require('dotenv').config(); // Load environment variables

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/wallet_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Event listeners for connection pool
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client:', err);
  process.exit(-1);
});

/**
 * Execute a database query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} - Query result
 */
const query = async (text, params) => {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    console.log(`📊 Executed query: ${text}`, {
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (error) {
    console.error('❌ Database query error:', {
      query: text,
      params: params,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise} - Database client
 */
const getClient = async () => {
  const client = await pool.connect();
  
  // Set a timeout to prevent client leaks
  const timeout = setTimeout(() => {
    console.error('⚠️ Client has been checked out for more than 30 seconds');
  }, 30000);
  
  const release = client.release;
  
  // Override release method to clear timeout
  client.release = () => {
    clearTimeout(timeout);
    release.apply(client);
  };
  
  return client;
};

/**
 * Check database health
 * @returns {Promise<Object>} - Health status object
 */
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as timestamp, version() as version');
    
    return {
      healthy: true,
      timestamp: result.rows[0].timestamp,
      version: result.rows[0].version,
      message: 'Database is RUNNING',
      connection: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      message: 'Database connection failed'
    };
  }
};

/**
 * Close all database connections
 * @returns {Promise}
 */
const close = async () => {
  try {
    await pool.end();
    console.log('🔌 Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error.message);
  }
};

// Export functions and pool
module.exports = {
  query,
  getClient,
  healthCheck,
  close,
  pool
};