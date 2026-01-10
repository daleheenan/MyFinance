/**
 * Date Utilities
 *
 * Provides consistent UTC-based date handling for financial calculations.
 * All date boundaries and calculations use UTC to avoid timezone-related issues.
 */

/**
 * Get today's date in YYYY-MM-DD format (UTC).
 * @returns {string} Today's date in UTC
 */
export function getTodayUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Get current month in YYYY-MM format (UTC).
 * @returns {string} Current month in UTC
 */
export function getCurrentMonthUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get current year (UTC).
 * @returns {number} Current year in UTC
 */
export function getCurrentYearUTC() {
  return new Date().getUTCFullYear();
}

/**
 * Get the first day of a month from a date.
 * @param {Date} date - The date object
 * @returns {string} First day of the month in YYYY-MM-DD format
 */
export function getFirstDayOfMonth(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Get the last day of a month from a date.
 * @param {Date} date - The date object
 * @returns {string} Last day of the month in YYYY-MM-DD format
 */
export function getLastDayOfMonth(date) {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Get the month string (YYYY-MM) from a date.
 * @param {Date} date - The date object
 * @returns {string} Month in YYYY-MM format
 */
export function getMonthString(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get a date N months ago from now (UTC).
 * @param {number} months - Number of months to go back
 * @returns {Date} Date object representing N months ago
 */
export function getMonthsAgo(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/**
 * Get a date N months ahead from now (UTC).
 * @param {number} months - Number of months ahead
 * @returns {Date} Date object representing N months ahead
 */
export function getMonthsAhead(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}

/**
 * Get a date N days ago from now (UTC).
 * @param {number} days - Number of days to go back
 * @param {Date} [referenceDate] - Optional reference date (defaults to now)
 * @returns {string} Date in YYYY-MM-DD format
 */
export function getDaysAgo(days, referenceDate = null) {
  const date = referenceDate ? new Date(referenceDate) : new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Get a date N days ahead from now (UTC).
 * @param {number} days - Number of days ahead
 * @param {Date} [referenceDate] - Optional reference date (defaults to now)
 * @returns {string} Date in YYYY-MM-DD format
 */
export function getDaysAhead(days, referenceDate = null) {
  const date = referenceDate ? new Date(referenceDate) : new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Format a Date object to YYYY-MM-DD string (UTC).
 * @param {Date} date - The date object
 * @returns {string} Date in YYYY-MM-DD format
 */
export function formatDateUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object (treats as UTC).
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Date object
 */
export function parseDateUTC(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get the day of month from a date string.
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {number} Day of month (1-31)
 */
export function getDayOfMonth(dateStr) {
  return parseDateUTC(dateStr).getUTCDate();
}

/**
 * Generate an array of the last N months as YYYY-MM strings.
 * @param {number} count - Number of months
 * @returns {Array<string>} Array of month strings
 */
export function getLastNMonths(count) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(getMonthString(date));
  }
  return months;
}
