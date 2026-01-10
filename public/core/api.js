/**
 * API Client for FinanceFlow
 * Fetch wrapper with automatic JSON parsing and error handling
 */

import { auth } from './auth.js';

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
  const headers = {
    'Content-Type': 'application/json'
  };

  // Add auth token if available
  const token = auth.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers
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

  // Handle 401 - session expired or invalid
  if (response.status === 401) {
    // Clear auth state and redirect to login
    await auth.logout();
    window.location.hash = '#/login';
    throw new Error('Session expired. Please log in again.');
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
