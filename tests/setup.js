// tests/setup.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = 3001;

// Mock database for testing
jest.mock('../db', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve({
      query: jest.fn(),
      release: jest.fn()
    })),
    end: jest.fn()
  };

  return {
    query: jest.fn(),
    getClient: jest.fn(() => Promise.resolve({
      query: jest.fn(),
      release: jest.fn()
    })),
    healthCheck: jest.fn(() => Promise.resolve({
      healthy: true,
      timestamp: new Date(),
      message: 'Database is RUNNING'
    })),
    pool: mockPool
  };
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test data
global.testUsers = {
  admin: {
    id: 1,
    email: 'admin@example.com',
    password_hash: '$2b$10$testhash',
    role: 'ADMIN',
    full_name: 'Admin User'
  },
  trainer: {
    id: 2,
    email: 'trainer@example.com',
    password_hash: '$2b$10$testhash',
    role: 'TRAINER',
    full_name: 'Trainer User'
  }
};

global.testVendors = [
  {
    id: 1,
    name: 'Test Vendor',
    contact_info: 'test@vendor.com',
    location: 'Test Location',
    is_active: true
  }
];

global.testSessions = [
  {
    id: 1,
    facilitator_id: 2,
    allocated: 1000.00,
    spent: 0.00,
    status: 'active',
    campaign_wallet_id: 1
  }
];

global.testTransactions = [
  {
    id: 1,
    session_id: 1,
    type: 'SPEND',
    direction: 'DEBIT',
    amount: 50.00,
    vendor_id: 1,
    vendor: 'Test Vendor',
    location: 'Test Location'
  }
];

global.testWallet = {
  id: 1,
  balance: 10000.00,
  reserved: 1000.00
};