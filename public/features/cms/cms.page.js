/**
 * CMS Admin Page
 *
 * Admin interface for managing CMS pages and images.
 * Only accessible to admin users (user.id === 1)
 */

import { api } from '../../core/api.js';
import { showSuccess, showError } from '../../core/toast.js';
import { auth } from '../../core/auth.js';

let container = null;
let currentView = 'pages'; // 'pages', 'editor', 'images'
let currentPage = null;
let htmlEditor = null;
let cssEditor = null;

/**
 * Mount the CMS page
 */
export async function mount(el) {
  container = el;

  // Check if user is admin
  if (auth.getUserId() !== 1) {
    container.innerHTML = `
      <div class="cms-container">
        <div class="cms-empty-state">
          <div class="cms-empty-state-icon">🔒</div>
          <h2 class="cms-empty-state-title">Access Denied</h2>
          <p class="cms-empty-state-text">You must be an admin to access the CMS.</p>
        </div>
      </div>
    `;
    return;
  }

  await renderCurrentView();
}

/**
 * Unmount the CMS page
 */
export function unmount() {
  if (htmlEditor) {
    htmlEditor.toTextArea();
    htmlEditor = null;
  }
  if (cssEditor) {
    cssEditor.toTextArea();
    cssEditor = null;
  }
  container = null;
  currentPage = null;
}

/**
 * Render the current view
 */
async function renderCurrentView() {
  switch (currentView) {
    case 'pages':
      await renderPagesList();
      break;
    case 'editor':
      await renderEditor();
      break;
    case 'images':
      await renderImagesGallery();
      break;
  }
}

/**
 * Render the pages list view
 */
async function renderPagesList() {
  container.innerHTML = `
    <div class="cms-container">
      <div class="cms-header">
        <h1>CMS Pages</h1>
        <div>
          <button class="cms-btn cms-btn-secondary" id="cms-images-btn">Images</button>
          <button class="cms-btn cms-btn-primary" id="cms-new-page-btn">New Page</button>
        </div>
      </div>
      <div class="cms-pages-list" id="cms-pages-container">
        <div class="cms-empty-state">
          <div class="spinner"></div>
          <p>Loading pages...</p>
        </div>
      </div>
    </div>
  `;

  // Bind header buttons
  document.getElementById('cms-new-page-btn').addEventListener('click', () => {
    currentPage = null;
    currentView = 'editor';
    renderCurrentView();
  });

  document.getElementById('cms-images-btn').addEventListener('click', () => {
    currentView = 'images';
    renderCurrentView();
  });

  // Load pages
  try {
    const response = await api.get('/api/cms/admin/pages');
    const pages = response.data;

    const pagesContainer = document.getElementById('cms-pages-container');

    if (pages.length === 0) {
      pagesContainer.innerHTML = `
        <div class="cms-empty-state">
          <div class="cms-empty-state-icon">📄</div>
          <h2 class="cms-empty-state-title">No Pages Yet</h2>
          <p class="cms-empty-state-text">Create your first CMS page to get started.</p>
          <button class="cms-btn cms-btn-primary" id="cms-create-first-btn">Create Page</button>
        </div>
      `;
      document.getElementById('cms-create-first-btn').addEventListener('click', () => {
        currentPage = null;
        currentView = 'editor';
        renderCurrentView();
      });
      return;
    }

    pagesContainer.innerHTML = `
      <table class="cms-pages-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pages.map(page => `
            <tr data-id="${page.id}">
              <td class="cms-page-title">${escapeHtml(page.title)}</td>
              <td class="cms-page-slug">/${page.slug}</td>
              <td>
                <span class="cms-status-badge ${page.isPublished ? 'published' : 'draft'}">
                  ${page.isPublished ? 'Published' : 'Draft'}
                </span>
              </td>
              <td>${formatDate(page.updated_at)}</td>
              <td class="cms-actions">
                <button class="cms-btn cms-btn-secondary cms-edit-btn" data-id="${page.id}">Edit</button>
                ${page.isPublished
                  ? `<button class="cms-btn cms-btn-secondary cms-unpublish-btn" data-id="${page.id}">Unpublish</button>`
                  : `<button class="cms-btn cms-btn-success cms-publish-btn" data-id="${page.id}">Publish</button>`
                }
                <button class="cms-btn cms-btn-danger cms-delete-btn" data-id="${page.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Bind action buttons
    pagesContainer.querySelectorAll('.cms-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editPage(parseInt(btn.dataset.id)));
    });

    pagesContainer.querySelectorAll('.cms-publish-btn').forEach(btn => {
      btn.addEventListener('click', () => togglePublish(parseInt(btn.dataset.id), true));
    });

    pagesContainer.querySelectorAll('.cms-unpublish-btn').forEach(btn => {
      btn.addEventListener('click', () => togglePublish(parseInt(btn.dataset.id), false));
    });

    pagesContainer.querySelectorAll('.cms-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deletePage(parseInt(btn.dataset.id)));
    });

  } catch (error) {
    showError('Failed to load pages: ' + error.message);
    document.getElementById('cms-pages-container').innerHTML = `
      <div class="cms-empty-state">
        <div class="cms-empty-state-icon">⚠️</div>
        <h2 class="cms-empty-state-title">Error Loading Pages</h2>
        <p class="cms-empty-state-text">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

/**
 * Edit a page
 */
async function editPage(id) {
  try {
    const response = await api.get(`/api/cms/admin/pages/${id}`);
    currentPage = response.data;
    currentView = 'editor';
    await renderCurrentView();
  } catch (error) {
    showError('Failed to load page: ' + error.message);
  }
}

/**
 * Toggle page publish status
 */
async function togglePublish(id, publish) {
  try {
    const endpoint = publish ? 'publish' : 'unpublish';
    await api.put(`/api/cms/admin/pages/${id}/${endpoint}`);
    showSuccess(publish ? 'Page published' : 'Page unpublished');
    await renderPagesList();
  } catch (error) {
    showError('Failed to update page: ' + error.message);
  }
}

/**
 * Delete a page
 */
async function deletePage(id) {
  if (!confirm('Are you sure you want to delete this page? This cannot be undone.')) {
    return;
  }

  try {
    await api.delete(`/api/cms/admin/pages/${id}`);
    showSuccess('Page deleted');
    await renderPagesList();
  } catch (error) {
    showError('Failed to delete page: ' + error.message);
  }
}

/**
 * Render the page editor
 */
async function renderEditor() {
  const isNew = !currentPage;
  const page = currentPage || {
    title: '',
    slug: '',
    content: '',
    css: '',
    metaTitle: '',
    metaDescription: ''
  };

  container.innerHTML = `
    <div class="cms-container">
      <div class="cms-header">
        <h1>${isNew ? 'New Page' : 'Edit Page'}</h1>
        <div>
          <button class="cms-btn cms-btn-secondary" id="cms-back-btn">Back to Pages</button>
          <button class="cms-btn cms-btn-primary" id="cms-save-btn">Save Page</button>
        </div>
      </div>
      <div class="cms-editor">
        <div class="cms-editor-sidebar">
          <div class="cms-form-group">
            <label for="cms-title">Title</label>
            <input type="text" id="cms-title" value="${escapeHtml(page.title)}" placeholder="Page Title">
          </div>
          <div class="cms-form-group">
            <label for="cms-slug">Slug</label>
            <input type="text" id="cms-slug" value="${escapeHtml(page.slug)}" placeholder="page-slug">
          </div>
          <div class="cms-form-group">
            <label for="cms-meta-title">Meta Title (SEO)</label>
            <input type="text" id="cms-meta-title" value="${escapeHtml(page.meta_title || page.metaTitle || '')}" placeholder="SEO Title">
          </div>
          <div class="cms-form-group">
            <label for="cms-meta-description">Meta Description (SEO)</label>
            <textarea id="cms-meta-description" placeholder="SEO Description">${escapeHtml(page.meta_description || page.metaDescription || '')}</textarea>
          </div>
          ${!isNew ? `
            <div class="cms-form-group">
              <label>Preview</label>
              <a href="/page/${escapeHtml(page.slug)}" target="_blank" class="cms-btn cms-btn-secondary" style="width: 100%; text-align: center;">
                View Page
              </a>
            </div>
          ` : ''}
        </div>
        <div class="cms-editor-main">
          <div class="cms-editor-tabs">
            <button class="cms-editor-tab active" data-tab="html">HTML Content</button>
            <button class="cms-editor-tab" data-tab="css">CSS Styles</button>
            <button class="cms-editor-tab" data-tab="preview">Preview</button>
          </div>
          <div class="cms-editor-content">
            <div id="cms-tab-html" class="cms-tab-content">
              <textarea id="cms-html-editor">${escapeHtml(page.content)}</textarea>
            </div>
            <div id="cms-tab-css" class="cms-tab-content" style="display: none;">
              <textarea id="cms-css-editor">${escapeHtml(page.css)}</textarea>
            </div>
            <div id="cms-tab-preview" class="cms-tab-content" style="display: none;">
              <iframe id="cms-preview-frame" class="cms-preview-frame"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize CodeMirror editors
  if (typeof CodeMirror !== 'undefined') {
    htmlEditor = CodeMirror.fromTextArea(document.getElementById('cms-html-editor'), {
      mode: 'htmlmixed',
      theme: 'monokai',
      lineNumbers: true,
      lineWrapping: true,
      autoCloseTags: true,
      autoCloseBrackets: true
    });

    cssEditor = CodeMirror.fromTextArea(document.getElementById('cms-css-editor'), {
      mode: 'css',
      theme: 'monokai',
      lineNumbers: true,
      lineWrapping: true,
      autoCloseBrackets: true
    });

    // Set editor heights
    htmlEditor.setSize(null, '400px');
    cssEditor.setSize(null, '400px');
  }

  // Auto-generate slug from title
  const titleInput = document.getElementById('cms-title');
  const slugInput = document.getElementById('cms-slug');

  if (isNew) {
    titleInput.addEventListener('input', () => {
      const slug = titleInput.value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      slugInput.value = slug;
    });
  }

  // Tab switching
  document.querySelectorAll('.cms-editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.cms-editor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding content
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.cms-tab-content').forEach(c => c.style.display = 'none');
      document.getElementById(`cms-tab-${tabName}`).style.display = 'block';

      // Update preview if switching to preview tab
      if (tabName === 'preview') {
        updatePreview();
      }

      // Refresh CodeMirror when switching to its tab
      if (tabName === 'html' && htmlEditor) {
        htmlEditor.refresh();
      }
      if (tabName === 'css' && cssEditor) {
        cssEditor.refresh();
      }
    });
  });

  // Back button
  document.getElementById('cms-back-btn').addEventListener('click', () => {
    currentPage = null;
    currentView = 'pages';
    renderCurrentView();
  });

  // Save button
  document.getElementById('cms-save-btn').addEventListener('click', savePage);
}

/**
 * Update the preview iframe
 */
function updatePreview() {
  const content = htmlEditor ? htmlEditor.getValue() : document.getElementById('cms-html-editor').value;
  const css = cssEditor ? cssEditor.getValue() : document.getElementById('cms-css-editor').value;
  const title = document.getElementById('cms-title').value;

  const previewFrame = document.getElementById('cms-preview-frame');
  const previewDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;

  previewDoc.open();
  previewDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(title)}</title>
      <link rel="stylesheet" href="/marketing/css/marketing.css">
      <style>${css}</style>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `);
  previewDoc.close();
}

/**
 * Save the current page
 */
async function savePage() {
  const title = document.getElementById('cms-title').value.trim();
  const slug = document.getElementById('cms-slug').value.trim();
  const content = htmlEditor ? htmlEditor.getValue() : document.getElementById('cms-html-editor').value;
  const css = cssEditor ? cssEditor.getValue() : document.getElementById('cms-css-editor').value;
  const metaTitle = document.getElementById('cms-meta-title').value.trim();
  const metaDescription = document.getElementById('cms-meta-description').value.trim();

  if (!title) {
    showError('Title is required');
    return;
  }

  if (!slug) {
    showError('Slug is required');
    return;
  }

  const data = { title, slug, content, css, metaTitle, metaDescription };

  try {
    if (currentPage) {
      // Update existing page
      const response = await api.put(`/api/cms/admin/pages/${currentPage.id}`, data);
      currentPage = response.data;
      showSuccess('Page saved');
    } else {
      // Create new page
      const response = await api.post('/api/cms/admin/pages', data);
      currentPage = response.data;
      showSuccess('Page created');
    }
  } catch (error) {
    showError('Failed to save page: ' + error.message);
  }
}

/**
 * Render the images gallery
 */
async function renderImagesGallery() {
  container.innerHTML = `
    <div class="cms-container">
      <div class="cms-header">
        <h1>Image Gallery</h1>
        <button class="cms-btn cms-btn-secondary" id="cms-back-to-pages">Back to Pages</button>
      </div>
      <div class="cms-upload-zone" id="cms-upload-zone">
        <div class="cms-upload-zone-icon">📁</div>
        <div class="cms-upload-zone-text">Drag and drop images here or click to upload</div>
        <div class="cms-upload-zone-hint">Supports: JPEG, PNG, GIF, WebP, SVG (max 5MB)</div>
        <input type="file" id="cms-file-input" accept="image/*" multiple style="display: none;">
      </div>
      <div class="cms-images-grid" id="cms-images-container">
        <div class="cms-empty-state">
          <div class="spinner"></div>
          <p>Loading images...</p>
        </div>
      </div>
    </div>
  `;

  // Bind back button
  document.getElementById('cms-back-to-pages').addEventListener('click', () => {
    currentView = 'pages';
    renderCurrentView();
  });

  // Setup upload zone
  const uploadZone = document.getElementById('cms-upload-zone');
  const fileInput = document.getElementById('cms-file-input');

  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  // Load images
  await loadImages();
}

/**
 * Load and display images
 */
async function loadImages() {
  try {
    const response = await api.get('/api/cms/admin/images');
    const images = response.data;

    const imagesContainer = document.getElementById('cms-images-container');

    if (images.length === 0) {
      imagesContainer.innerHTML = `
        <div class="cms-empty-state" style="grid-column: 1 / -1;">
          <div class="cms-empty-state-icon">🖼️</div>
          <h2 class="cms-empty-state-title">No Images Yet</h2>
          <p class="cms-empty-state-text">Upload images to use in your CMS pages.</p>
        </div>
      `;
      return;
    }

    imagesContainer.innerHTML = images.map(img => `
      <div class="cms-image-card" data-id="${img.id}">
        <div class="cms-image-preview">
          <img src="${img.url}" alt="${escapeHtml(img.alt_text || img.original_name)}" loading="lazy">
        </div>
        <div class="cms-image-info">
          <div class="cms-image-name">${escapeHtml(img.original_name)}</div>
          <div class="cms-image-meta">${formatFileSize(img.file_size)}</div>
        </div>
        <div class="cms-image-actions">
          <button class="cms-btn cms-btn-secondary cms-copy-url" data-url="${img.url}">Copy URL</button>
          <button class="cms-btn cms-btn-danger cms-delete-image" data-id="${img.id}">Delete</button>
        </div>
      </div>
    `).join('');

    // Bind copy URL buttons
    imagesContainer.querySelectorAll('.cms-copy-url').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.origin + btn.dataset.url);
        showSuccess('URL copied to clipboard');
      });
    });

    // Bind delete buttons
    imagesContainer.querySelectorAll('.cms-delete-image').forEach(btn => {
      btn.addEventListener('click', () => deleteImage(parseInt(btn.dataset.id)));
    });

  } catch (error) {
    showError('Failed to load images: ' + error.message);
  }
}

/**
 * Handle file uploads
 */
async function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      showError(`${file.name} is not an image`);
      continue;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError(`${file.name} is too large (max 5MB)`);
      continue;
    }

    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/cms/admin/images', {
        method: 'POST',
        body: formData,
        headers: {
          'X-CSRF-Token': getCsrfToken()
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      showSuccess(`${file.name} uploaded`);
    } catch (error) {
      showError(`Failed to upload ${file.name}: ${error.message}`);
    }
  }

  await loadImages();
}

/**
 * Delete an image
 */
async function deleteImage(id) {
  if (!confirm('Are you sure you want to delete this image?')) {
    return;
  }

  try {
    await api.delete(`/api/cms/admin/images/${id}`);
    showSuccess('Image deleted');
    await loadImages();
  } catch (error) {
    showError('Failed to delete image: ' + error.message);
  }
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
