/**
 * API Client for FinanceFlow
 * Fetch wrapper with automatic JSON parsing and error handling
 */

const BASE_URL = '/api';

/**
 * Make an HTTP request to the API
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - API endpoint path (e.g., '/accounts')
 * @param {object|null} data - Request body data (for POST/PUT)
 * @returns {Promise<any>} - Response data
 * @throws {Error} - On request failure or !success response
 */
async function request(method, path, data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const url = `${BASE_URL}${path}`;

  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new Error(`Invalid JSON response from ${method} ${path}`);
  }

  // Check for API-level success
  if (!json.success) {
    throw new Error(json.error || `Request failed: ${method} ${path}`);
  }

  return json.data;
}

/**
 * API client with methods for each HTTP verb
 */
export const api = {
  /**
   * GET request
   * @param {string} path - API endpoint path
   * @returns {Promise<any>} - Response data
   */
  get: (path) => request('GET', path),

  /**
   * POST request
   * @param {string} path - API endpoint path
   * @param {object} data - Request body
   * @returns {Promise<any>} - Response data
   */
  post: (path, data) => request('POST', path, data),

  /**
   * PUT request
   * @param {string} path - API endpoint path
   * @param {object} data - Request body
   * @returns {Promise<any>} - Response data
   */
  put: (path, data) => request('PUT', path, data),

  /**
   * DELETE request
   * @param {string} path - API endpoint path
   * @returns {Promise<any>} - Response data
   */
  delete: (path) => request('DELETE', path)
};
