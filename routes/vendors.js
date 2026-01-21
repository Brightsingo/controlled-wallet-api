// routes/vendors.js
const express = require('express');
const { query } = require('../db');
const { verifyToken, requireRole } = require('../src/middleware/auth');

const router = express.Router();

/**
 * GET /api/vendors
 * Get all vendors (Admin only)
 */
router.get('/vendors', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { active_only = 'true', search } = req.query;
    
    let queryStr = 'SELECT * FROM vendors';
    const params = [];
    
    // Apply filters
    const conditions = [];
    
    if (active_only === 'true') {
      conditions.push('is_active = true');
    }
    
    if (search) {
      conditions.push('(name ILIKE $1 OR location ILIKE $1 OR contact_info ILIKE $1)');
      params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      queryStr += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryStr += ' ORDER BY name';
    
    const result = await query(queryStr, params);
    
    res.json({
      success: true,
      data: {
        vendors: result.rows,
        count: result.rowCount
      }
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to fetch vendors' 
    });
  }
});

/**
 * POST /api/vendors
 * Create vendor (Admin only)
 */
router.post('/vendors', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, contact_info, location, is_active = true } = req.body;

    // Validate input
    if (!name || name.trim() === '') {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Vendor name is required' 
      });
    }

    // Check if vendor already exists
    const existingResult = await query(
      'SELECT id FROM vendors WHERE name ILIKE $1',
      [name.trim()]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Validation failed',
        details: 'Vendor with this name already exists' 
      });
    }

    const result = await query(
      `INSERT INTO vendors (name, contact_info, location, is_active) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name.trim(), contact_info || null, location || null, is_active]
    );

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: {
        vendor: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to create vendor' 
    });
  }
});

/**
 * GET /api/vendors/:id
 * Get vendor by ID (Admin only)
 */
router.get('/vendors/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    
    const result = await query(
      'SELECT * FROM vendors WHERE id = $1',
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'Vendor not found' 
      });
    }

    res.json({
      success: true,
      data: {
        vendor: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to fetch vendor' 
    });
  }
});

/**
 * PUT /api/vendors/:id
 * Update vendor (Admin only)
 */
router.put('/vendors/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);
    const { name, contact_info, location, is_active } = req.body;

    // Check if vendor exists
    const existingResult = await query(
      'SELECT id FROM vendors WHERE id = $1',
      [vendorId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'Vendor not found' 
      });
    }

    // Check name uniqueness if changing name
    if (name) {
      const nameCheck = await query(
        'SELECT id FROM vendors WHERE name ILIKE $1 AND id != $2',
        [name.trim(), vendorId]
      );

      if (nameCheck.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Validation failed',
          details: 'Another vendor with this name already exists' 
        });
      }
    }

    const result = await query(
      `UPDATE vendors 
       SET name = COALESCE($1, name),
           contact_info = COALESCE($2, contact_info),
           location = COALESCE($3, location),
           is_active = COALESCE($4, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name ? name.trim() : null, contact_info, location, is_active, vendorId]
    );

    res.json({
      success: true,
      message: 'Vendor updated successfully',
      data: {
        vendor: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to update vendor' 
    });
  }
});

/**
 * DELETE /api/vendors/:id
 * Delete vendor (Admin only) - Soft delete by setting is_active = false
 */
router.delete('/vendors/:id', verifyToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const vendorId = parseInt(req.params.id);

    // Check if vendor exists
    const existingResult = await query(
      'SELECT id FROM vendors WHERE id = $1',
      [vendorId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not found',
        details: 'Vendor not found' 
      });
    }

    // Check if vendor is used in transactions
    const usageCheck = await query(
      'SELECT COUNT(*) as transaction_count FROM transactions WHERE vendor_id = $1',
      [vendorId]
    );

    const transactionCount = parseInt(usageCheck.rows[0].transaction_count);
    
    if (transactionCount > 0) {
      // Soft delete - set is_active = false
      await query(
        'UPDATE vendors SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [vendorId]
      );
      
      res.json({
        success: true,
        message: 'Vendor deactivated (soft delete) because it has existing transactions',
        data: {
          vendor_id: vendorId,
          transaction_count: transactionCount,
          status: 'deactivated'
        }
      });
    } else {
      // Hard delete - vendor has no transactions
      await query('DELETE FROM vendors WHERE id = $1', [vendorId]);
      
      res.json({
        success: true,
        message: 'Vendor deleted successfully',
        data: {
          vendor_id: vendorId,
          status: 'deleted'
        }
      });
    }
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ 
      error: 'Operation failed',
      details: 'Failed to delete vendor' 
    });
  }
});

module.exports = router;