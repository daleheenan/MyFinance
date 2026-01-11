/**
 * Import Routes (TASK-3.4)
 *
 * Handles CSV file imports for transactions:
 * - POST /api/import/preview - Preview CSV data before import
 * - POST /api/import - Import CSV with column mapping
 * - GET /api/import/batches - List import history
 * - GET /api/import/batches/:id - Get batch details with transactions
 */

import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { getDb } from '../../core/database.js';
import { bulkAssignCategories } from '../categories/categories.service.js';
import { detectTransfers, linkTransferPair } from '../transactions/transfer.service.js';
import { calculateRunningBalances } from '../accounts/balance.service.js';

const router = Router();

// Allowed MIME types for CSV uploads
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel' // Some browsers report CSV as Excel
];

// File filter for CSV validation
const csvFileFilter = (req, file, cb) => {
  // Check MIME type
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  // Also check file extension as fallback
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (ext === 'csv') {
    cb(null, true);
    return;
  }

  cb(new Error('Only CSV files are allowed'), false);
};

// Configure multer for file uploads (memory storage with 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  fileFilter: csvFileFilter
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse CSV content from buffer
 * @param {Buffer} buffer - CSV file buffer
 * @returns {{ records: Array, columns: string[] }} Parsed records and column names
 */
function parseCsv(buffer) {
  const content = buffer.toString('utf-8').trim();

  if (!content) {
    throw new Error('CSV file is empty or contains no data');
  }

  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });

    if (records.length === 0) {
      throw new Error('CSV file is empty or contains no data');
    }

    const columns = Object.keys(records[0]);
    return { records, columns };
  } catch (err) {
    if (err.message.includes('empty') || err.message.includes('no data')) {
      throw err;
    }
    throw new Error(`Failed to parse CSV: ${err.message}`);
  }
}

/**
 * Auto-detect column mapping from CSV columns
 * @param {string[]} columns - Array of column names
 * @returns {object} Suggested mapping
 */
function detectColumnMapping(columns) {
  const mapping = {};
  const lowerColumns = columns.map(c => c.toLowerCase());

  // Date detection
  const datePatterns = ['date', 'trans date', 'transaction date', 'posted date', 'value date'];
  for (let i = 0; i < columns.length; i++) {
    if (datePatterns.some(p => lowerColumns[i].includes(p))) {
      mapping.date = columns[i];
      break;
    }
  }

  // Description detection
  const descPatterns = ['description', 'desc', 'payee', 'details', 'narrative', 'memo', 'reference', 'merchant'];
  for (let i = 0; i < columns.length; i++) {
    if (descPatterns.some(p => lowerColumns[i].includes(p))) {
      mapping.description = columns[i];
      break;
    }
  }

  // Single amount column detection (check this first)
  const amountPatterns = ['amount', 'value', 'sum'];
  for (let i = 0; i < columns.length; i++) {
    // Only match "amount" if it's not "debit amount" or "credit amount"
    if (amountPatterns.some(p => lowerColumns[i] === p || (lowerColumns[i].includes(p) && !lowerColumns[i].includes('debit') && !lowerColumns[i].includes('credit')))) {
      mapping.amount = columns[i];
      break;
    }
  }

  // Debit detection
  const debitPatterns = ['debit', 'withdrawal', 'out', 'paid out', 'money out'];
  for (let i = 0; i < columns.length; i++) {
    if (debitPatterns.some(p => lowerColumns[i].includes(p))) {
      mapping.debit = columns[i];
      break;
    }
  }

  // Credit detection
  const creditPatterns = ['credit', 'deposit', 'in', 'paid in', 'money in'];
  for (let i = 0; i < columns.length; i++) {
    if (creditPatterns.some(p => lowerColumns[i].includes(p))) {
      mapping.credit = columns[i];
      break;
    }
  }

  return mapping;
}

/**
 * Parse date from various formats to YYYY-MM-DD
 * @param {string} dateStr - Date string in various formats
 * @returns {string|null} ISO date string or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match1 = dateStr.match(ddmmyyyy);
  if (match1) {
    const [, day, month, year] = match1;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD format (already ISO)
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (yyyymmdd.test(dateStr)) {
    return dateStr;
  }

  // Try MM/DD/YYYY format
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match2 = dateStr.match(mmddyyyy);
  if (match2) {
    // Assuming DD/MM/YYYY for UK format - already handled above
    // This would be for US format - uncomment if needed
    // const [, month, day, year] = match2;
    // return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try parsing as Date object
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Parse amount string to number
 * @param {string} amountStr - Amount string (may include currency symbols)
 * @returns {number} Parsed amount
 */
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === '') return 0;

  // Normalize the string
  let cleaned = amountStr.trim();

  // Check for negative indicators (parentheses or trailing minus)
  const hasParentheses = cleaned.startsWith('(') && cleaned.endsWith(')');
  const hasLeadingMinus = cleaned.startsWith('-');
  const hasTrailingMinus = cleaned.endsWith('-') && !cleaned.startsWith('-');

  // Remove currency symbols, parentheses, spaces, and commas
  // Also remove all minus signs - we'll add back if needed based on indicators
  cleaned = cleaned.replace(/[£$€,()  \-]/g, '');

  // Parse the numeric value
  let amount = parseFloat(cleaned);
  if (isNaN(amount)) return 0;

  // Apply negative sign based on indicators
  if (hasParentheses || hasLeadingMinus || hasTrailingMinus) {
    amount = -Math.abs(amount);
  }

  return Math.round(amount * 100) / 100;
}

/**
 * Validate column mapping has required fields
 * @param {object} mapping - Column mapping object
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMapping(mapping) {
  const required = ['date', 'description'];

  for (const field of required) {
    if (!mapping[field]) {
      return { valid: false, error: `Mapping must include '${field}' column` };
    }
  }

  // Must have: (debit or credit) OR amount
  if (!mapping.debit && !mapping.credit && !mapping.amount) {
    return { valid: false, error: "Mapping must include 'debit', 'credit', or 'amount' column" };
  }

  return { valid: true };
}

// =============================================================================
// POST /api/import/preview
// =============================================================================
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    // Check file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    // Parse CSV
    const { records, columns } = parseCsv(req.file.buffer);

    // Get preview (first 10 rows)
    const preview = records.slice(0, 10);

    // Auto-detect column mapping
    const suggestedMapping = detectColumnMapping(columns);

    return res.json({
      success: true,
      data: {
        columns,
        preview,
        totalRows: records.length,
        suggestedMapping
      }
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================================
// POST /api/import
// =============================================================================
router.post('/', upload.single('file'), (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  try {
    // Validate file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'File is required'
      });
    }

    // Validate accountId
    const accountId = parseInt(req.body.accountId, 10);
    if (!accountId || isNaN(accountId)) {
      return res.status(400).json({
        success: false,
        error: 'Account ID is required'
      });
    }

    // Validate account exists and belongs to user
    const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Validate mapping
    if (!req.body.mapping) {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid mapping format - must be valid JSON'
      });
    }

    const mappingValidation = validateMapping(mapping);
    if (!mappingValidation.valid) {
      return res.status(400).json({
        success: false,
        error: mappingValidation.error
      });
    }

    // Parse CSV
    const { records } = parseCsv(req.file.buffer);

    // Process import in a transaction
    const errors = [];
    let imported = 0;
    let duplicatesSkipped = 0;
    let batchId;

    const importTransaction = db.transaction(() => {
      // Create import batch record
      const batchResult = db.prepare(`
        INSERT INTO import_batches (account_id, filename, row_count, success_count, error_count)
        VALUES (?, ?, ?, 0, 0)
      `).run(accountId, req.file.originalname, records.length);

      batchId = batchResult.lastInsertRowid;

      // Prepare insert statement
      const insertStmt = db.prepare(`
        INSERT INTO transactions (
          account_id,
          transaction_date,
          description,
          original_description,
          debit_amount,
          credit_amount,
          import_batch_id,
          category_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 11)
      `);

      // Prepare duplicate check statement
      const duplicateCheckStmt = db.prepare(`
        SELECT id FROM transactions
        WHERE account_id = ?
          AND transaction_date = ?
          AND original_description = ?
          AND debit_amount = ?
          AND credit_amount = ?
        LIMIT 1
      `);

      const insertedIds = [];

      // Process each row
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2; // +2 for header row and 1-based index

        try {
          // Extract data using mapping
          const dateStr = row[mapping.date];
          const description = row[mapping.description];

          // Parse date
          const transactionDate = parseDate(dateStr);
          if (!transactionDate) {
            throw new Error(`Invalid date format: ${dateStr}`);
          }

          // Validate description
          if (!description || description.trim() === '') {
            throw new Error('Description is empty');
          }

          // Parse amounts - support both separate debit/credit columns AND single amount column
          let debitAmount = 0;
          let creditAmount = 0;

          if (mapping.amount) {
            // Single amount column: negative = debit, positive = credit
            const amountStr = row[mapping.amount];
            const amount = parseAmount(amountStr);

            if (amount < 0) {
              debitAmount = Math.abs(amount);
            } else {
              creditAmount = amount;
            }
          } else {
            // Separate debit/credit columns
            const debitStr = mapping.debit ? row[mapping.debit] : '';
            const creditStr = mapping.credit ? row[mapping.credit] : '';
            debitAmount = parseAmount(debitStr);
            creditAmount = parseAmount(creditStr);
          }

          // Validate at least one amount (allow zero for one side, but not both)
          if (debitAmount === 0 && creditAmount === 0) {
            throw new Error('Both debit and credit amounts are zero or invalid');
          }

          // Check for duplicate transaction
          const existingTxn = duplicateCheckStmt.get(
            accountId,
            transactionDate,
            description.trim(),
            debitAmount,
            creditAmount
          );

          if (existingTxn) {
            duplicatesSkipped++;
            continue; // Skip this row, it's a duplicate
          }

          // Insert transaction
          const result = insertStmt.run(
            accountId,
            transactionDate,
            description.trim(),
            description.trim(),
            debitAmount,
            creditAmount,
            batchId
          );

          insertedIds.push(result.lastInsertRowid);
          imported++;
        } catch (err) {
          errors.push({
            row: rowNum,
            message: err.message,
            data: row
          });
        }
      }

      // Update batch with final counts
      db.prepare(`
        UPDATE import_batches
        SET success_count = ?, error_count = ?
        WHERE id = ?
      `).run(imported, errors.length, batchId);

      // Auto-assign categories to imported transactions (user's rules only)
      if (insertedIds.length > 0) {
        bulkAssignCategories(db, userId, insertedIds);
      }

      // Calculate running balances for the account
      calculateRunningBalances(db, accountId);

      return insertedIds;
    });

    const insertedIds = importTransaction();

    // Detect transfers (outside transaction since it's across accounts)
    // Only detect within this user's accounts
    if (insertedIds.length > 0) {
      try {
        const { pairs } = detectTransfers(db, userId);
        // Auto-link detected transfers
        for (const pair of pairs) {
          try {
            linkTransferPair(db, pair.debitTxnId, pair.creditTxnId, userId);
          } catch {
            // Ignore linking errors
          }
        }
      } catch {
        // Ignore transfer detection errors
      }
    }

    return res.json({
      success: true,
      data: {
        batchId,
        imported,
        duplicatesSkipped,
        errors
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================================
// GET /api/import/batches
// =============================================================================
router.get('/batches', (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  try {
    // Only show batches for user's accounts
    const batches = db.prepare(`
      SELECT
        ib.id,
        ib.account_id,
        a.account_name,
        ib.filename,
        ib.row_count,
        ib.success_count,
        ib.error_count,
        ib.imported_at
      FROM import_batches ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE a.user_id = ?
      ORDER BY ib.imported_at DESC
    `).all(userId);

    return res.json({
      success: true,
      data: batches
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================================
// GET /api/import/batches/:id
// =============================================================================
router.get('/batches/:id', (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch ID'
      });
    }

    // Get batch with account name - verify user ownership
    const batch = db.prepare(`
      SELECT
        ib.id,
        ib.account_id,
        a.account_name,
        ib.filename,
        ib.row_count,
        ib.success_count,
        ib.error_count,
        ib.imported_at
      FROM import_batches ib
      JOIN accounts a ON a.id = ib.account_id
      WHERE ib.id = ? AND a.user_id = ?
    `).get(id, userId);

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Import batch not found'
      });
    }

    // Get transactions for this batch
    const transactions = db.prepare(`
      SELECT
        t.id,
        t.transaction_date,
        t.description,
        t.original_description,
        t.debit_amount,
        t.credit_amount,
        t.balance_after,
        t.category_id,
        c.name as category_name,
        t.is_transfer
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.import_batch_id = ?
      ORDER BY t.transaction_date, t.id
    `).all(id);

    return res.json({
      success: true,
      data: {
        batch,
        transactions
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
