const { query } = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const migrationFile = path.join(__dirname, '../migrations/006_add_vendors_receipts.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Running migration...');
    await query(sql);
    console.log('Migration completed successfully!');
    
    // Verify the migration
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('vendors', 'receipts')
    `);
    
    console.log('Created tables:', tables.rows.map(row => row.table_name));
    
    const columns = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'transactions'
      AND column_name IN ('vendor_id', 'location', 'notes', 'device_id')
    `);
    
    console.log('Added columns to transactions:', columns.rows.map(row => row.column_name));
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();