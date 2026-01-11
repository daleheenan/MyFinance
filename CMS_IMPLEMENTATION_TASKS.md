# CMS Implementation Tasks

## Project Context
Adding a public-facing marketing website with an admin CMS to FinanceFlow.
- Marketing site serves at root path (`/`)
- App remains accessible at `/app`
- Admin CMS accessible at `/app#/cms` for user.id === 1 only

## User Design Requirements
The user provided a design mockup with:
- Clean white/light gray background
- Blue accent color (#3B82F6) for buttons and CTAs
- Header: Logo, Features, Pricing, About, Sign In button
- Hero: "Master Your Finances" headline with tagline and CTA
- Feature highlights section with icons
- Professional, modern sans-serif typography
- Rounded buttons and cards

---

## Phase 1: Database Schema [COMPLETED]
- [x] Add `cms_pages` table to `server/db/schema.sql`
  - Fields: id, slug (unique), title, content, css, meta_title, meta_description, is_published, created_at, updated_at
- [x] Add `cms_images` table to `server/db/schema.sql`
  - Fields: id, filename, original_name, mime_type, file_size, alt_text, uploaded_by, created_at
- [x] Add indexes for slug and published status

---

## Phase 2: Backend API [PENDING]

### 2.1 Create CMS Service (`server/features/cms/cms.service.js`)
- [ ] `getAllPages()` - List all CMS pages (admin)
- [ ] `getPageById(id)` - Get single page for editing (admin)
- [ ] `getPublishedPageBySlug(slug)` - Get published page (public)
- [ ] `createPage({ slug, title, content, css, meta_title, meta_description })` - Create page
- [ ] `updatePage(id, { ... })` - Update page
- [ ] `deletePage(id)` - Delete page
- [ ] `publishPage(id)` / `unpublishPage(id)` - Toggle publish status
- [ ] `getAllImages()` - List all uploaded images
- [ ] `createImage({ filename, original_name, mime_type, file_size, alt_text, uploaded_by })` - Record upload
- [ ] `deleteImage(id)` - Delete image record and file from disk

### 2.2 Create CMS Routes (`server/features/cms/cms.routes.js`)
Public endpoints (no auth):
- [ ] `GET /api/cms/pages/:slug` - Get published page content for rendering

Admin endpoints (requireAuth + isAdmin):
- [ ] `GET /api/cms/admin/pages` - List all pages
- [ ] `GET /api/cms/admin/pages/:id` - Get page for editing
- [ ] `POST /api/cms/admin/pages` - Create page
- [ ] `PUT /api/cms/admin/pages/:id` - Update page
- [ ] `DELETE /api/cms/admin/pages/:id` - Delete page
- [ ] `PUT /api/cms/admin/pages/:id/publish` - Publish page
- [ ] `PUT /api/cms/admin/pages/:id/unpublish` - Unpublish page
- [ ] `GET /api/cms/admin/images` - List uploaded images
- [ ] `POST /api/cms/admin/images` - Upload image (multer)
- [ ] `DELETE /api/cms/admin/images/:id` - Delete image

### 2.3 Admin Middleware
- [ ] Create `isAdmin` middleware that checks `req.user.id === 1`
- [ ] Apply to all `/api/cms/admin/*` routes

### 2.4 Image Upload Configuration
- [ ] Configure multer with disk storage
- [ ] Destination: `public/uploads/cms/`
- [ ] Filename: `${Date.now()}-${randomBytes(8).toString('hex')}${extname}`
- [ ] File size limit: 5MB
- [ ] MIME type whitelist: jpeg, png, gif, webp, svg+xml
- [ ] Create `public/uploads/cms/` directory

---

## Phase 3: Server Routing Updates [PENDING]

### 3.1 Modify `server/index.js`
Add BEFORE static middleware and API routes:

```javascript
import { join } from 'path';

// Marketing pages - serve static HTML
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../public/marketing/index.html'));
});

app.get('/features', (req, res) => {
  res.sendFile(join(__dirname, '../public/marketing/features.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(join(__dirname, '../public/marketing/pricing.html'));
});

// Dynamic CMS pages (optional, for custom pages created in CMS)
app.get('/page/:slug', async (req, res) => {
  // Fetch from cms_pages and render
});

// App entry point - serve SPA shell
app.get('/app', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});
app.get('/app/*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Then static files middleware
app.use(express.static(join(__dirname, '../public')));
```

---

## Phase 4: Marketing Site (Static HTML) [PENDING]

### 4.1 Create Directory Structure
```
public/marketing/
├── index.html          # Landing page
├── features.html       # Features page
├── pricing.html        # Pricing page
├── css/
│   └── marketing.css   # All marketing styles
└── images/             # Static marketing images (optional)
```

### 4.2 Create `public/marketing/css/marketing.css`
Design tokens from user mockup:
- Primary color: #3B82F6 (blue)
- Background: #FFFFFF, #F9FAFB (light gray sections)
- Text: #111827 (headings), #6B7280 (body)
- Border radius: 8px (buttons), 12px (cards)
- Font: system-ui, -apple-system, sans-serif
- Responsive breakpoints: 768px, 1024px

Sections to style:
- [ ] Header/navigation with logo and links
- [ ] Hero section with headline, tagline, CTA button
- [ ] Features grid with icons and descriptions
- [ ] Pricing cards (if applicable)
- [ ] Footer with links
- [ ] Mobile responsive styles

### 4.3 Create `public/marketing/index.html`
Based on user's design mockup:
- [ ] Header: FinanceFlow logo, Features, Pricing, About links, Sign In button (links to /app#/login)
- [ ] Hero: "Master Your Finances" headline, subtext about tracking/budgeting, blue CTA button
- [ ] Features section: 3-4 feature highlights with icons
- [ ] Footer: Copyright, Privacy, Terms links

### 4.4 Create `public/marketing/features.html`
- [ ] Same header/footer as landing
- [ ] Detailed feature descriptions
- [ ] Screenshots or illustrations

### 4.5 Create `public/marketing/pricing.html`
- [ ] Same header/footer as landing
- [ ] Pricing tiers or "Free to use" messaging
- [ ] CTA to sign up

---

## Phase 5: CMS Admin Interface [PENDING]

### 5.1 Create `public/features/cms/cms.css`
- [ ] Page list table styles
- [ ] Editor layout (sidebar + main content)
- [ ] CodeMirror container styles
- [ ] Image gallery grid
- [ ] Drag-drop upload zone
- [ ] Publish toggle switch
- [ ] Responsive admin layout

### 5.2 Create `public/features/cms/cms.page.js`
Module structure:
```javascript
export function mount(container, params) { ... }
export function unmount() { ... }
```

Features to implement:
- [ ] **Pages List View**
  - Table with columns: Title, Slug, Status (Published/Draft), Actions
  - Add Page button
  - Edit/Delete buttons per row

- [ ] **Page Editor View**
  - Form fields: Title, Slug (auto-generated from title), Meta Title, Meta Description
  - Tabs: HTML Content | CSS Styles | Preview
  - CodeMirror editor for HTML (mode: htmlmixed)
  - CodeMirror editor for CSS (mode: css)
  - Live preview iframe
  - Save button, Publish/Unpublish toggle
  - Back to list button

- [ ] **Image Gallery View**
  - Grid of uploaded images with thumbnails
  - Click to copy URL to clipboard
  - Delete button with confirmation
  - Upload zone (drag-drop or button)
  - Show filename, size, upload date

### 5.3 Add CodeMirror CDN to `public/index.html`
Add in `<head>`:
```html
<!-- CodeMirror for CMS Editor -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/monokai.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
```

Add CSS link:
```html
<link rel="stylesheet" href="features/cms/cms.css">
```

### 5.4 Register Route in `public/core/app.js`
```javascript
import * as cmsPage from '../features/cms/cms.page.js';

// In registerRoutes():
router.register('/cms', cmsPage);
```

### 5.5 Add CMS Navigation for Admin
In settings page or nav dropdown, add link visible only to admin (user.id === 1):
```javascript
// Check if admin and show CMS link
if (auth.getUserId() === 1) {
  // Show CMS link
}
```

---

## Phase 6: Testing [PENDING]

### 6.1 Manual Testing Checklist
- [ ] Visit `/` - should show marketing landing page
- [ ] Visit `/features` - should show features page
- [ ] Visit `/pricing` - should show pricing page
- [ ] Click "Sign In" - should navigate to `/app#/login`
- [ ] After login, visit `/app#/overview` - should show app
- [ ] As admin, visit `/app#/cms` - should show CMS interface
- [ ] As non-admin, `/app#/cms` should redirect or show error
- [ ] Create a new CMS page
- [ ] Edit page content with HTML/CSS
- [ ] Preview page
- [ ] Publish/unpublish page
- [ ] Upload an image
- [ ] Copy image URL
- [ ] Delete image
- [ ] Delete page

### 6.2 E2E Tests (Optional)
- [ ] Add `tests/e2e/marketing.spec.js` for public pages
- [ ] Add `tests/e2e/cms.spec.js` for CMS admin

---

## Files to Create
1. `server/features/cms/cms.service.js`
2. `server/features/cms/cms.routes.js`
3. `public/marketing/index.html`
4. `public/marketing/features.html`
5. `public/marketing/pricing.html`
6. `public/marketing/css/marketing.css`
7. `public/features/cms/cms.page.js`
8. `public/features/cms/cms.css`
9. `public/uploads/cms/.gitkeep`

## Files to Modify
1. `server/index.js` - Add marketing routes before static middleware
2. `public/index.html` - Add CodeMirror CDN links and cms.css
3. `public/core/app.js` - Register CMS route

---

## Implementation Order
1. Backend first (service + routes) - enables testing API
2. Server routing - enables marketing pages
3. Marketing pages - visible results
4. CMS admin interface - final feature
5. Testing - verify everything works
