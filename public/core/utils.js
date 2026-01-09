/**
 * Utility Functions for FinanceFlow
 * Common formatting and helper functions
 */

/**
 * Format a number as GBP currency
 * @param {number} amount - Amount in pounds
 * @returns {string} - Formatted string (e.g., "1,234.56")
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(amount);
}

/**
 * Format a date string in UK format
 * @param {string} dateStr - ISO date string or Date-compatible string
 * @returns {string} - Formatted date (e.g., "15 Jan 2024")
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format a date as relative time
 * @param {string} dateStr - ISO date string or Date-compatible string
 * @returns {string} - Relative date (e.g., "Today", "Yesterday", "5 days ago")
 */
export function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();

  // Reset time portion for accurate day comparison
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = nowOnly - dateOnly;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return formatDate(dateStr);
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} - HTML-safe string
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Round to penny precision (2 decimal places)
 * @param {number} amount - Amount to round
 * @returns {number} - Rounded amount
 */
export function pennyPrecision(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Debounce a function call
 * @param {function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {function} - Debounced function
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Create a DOM element from an HTML string
 * @param {string} html - HTML string
 * @returns {HTMLElement} - DOM element
 */
export function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

/**
 * Get CSS class for amount (positive/negative/neutral)
 * @param {number} amount - Amount value
 * @param {string} type - Transaction type ('income', 'expense', 'neutral')
 * @returns {string} - CSS class name
 */
export function getAmountClass(amount, type = null) {
  if (type === 'neutral' || type === 'transfer') return 'amount-neutral';
  if (amount > 0) return 'amount-positive';
  if (amount < 0) return 'amount-negative';
  return 'amount-neutral';
}
