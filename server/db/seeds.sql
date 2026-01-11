-- FinanceFlow Seed Data
-- 4 Accounts, 11 Categories, Category Rules

-- Accounts (4)
INSERT OR IGNORE INTO accounts (account_number, account_name, sort_code, account_type, opening_balance) VALUES
('17570762', 'Main Account', '12-34-56', 'debit', 0),
('00393366', 'Daily Spend', '12-34-56', 'debit', 0),
('55128841', 'Theo Entertainment', '12-34-56', 'debit', 0),
('4521XXXXXXXX', 'Credit Card', NULL, 'credit', 0);

-- Categories (11)
INSERT OR IGNORE INTO categories (name, type, colour, icon, is_default, sort_order) VALUES
('Salary', 'income', '#34c759', '💰', 1, 1),
('Bills', 'expense', '#ff3b30', '📄', 1, 2),
('Groceries', 'expense', '#007aff', '🛒', 1, 3),
('Shopping', 'expense', '#ff9500', '🛍️', 1, 4),
('Entertainment', 'expense', '#af52de', '🎬', 1, 5),
('Transport', 'expense', '#5ac8fa', '🚗', 1, 6),
('Dining', 'expense', '#ff2d55', '🍽️', 1, 7),
('Healthcare', 'expense', '#32ade6', '⚕️', 1, 8),
('Utilities', 'expense', '#ff6482', '💡', 1, 9),
('Transfer', 'neutral', '#8e8e93', '↔️', 1, 10),
('Other', 'neutral', '#636366', '📌', 1, 11);

-- Category Rules
INSERT OR IGNORE INTO category_rules (pattern, category_id, priority) VALUES
('TESCO', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('SAINSBURY', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('ASDA', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('MORRISONS', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('LIDL', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('ALDI', (SELECT id FROM categories WHERE name = 'Groceries'), 10),
('AMAZON', (SELECT id FROM categories WHERE name = 'Shopping'), 10),
('UBER', (SELECT id FROM categories WHERE name = 'Transport'), 10),
('TRAINLINE', (SELECT id FROM categories WHERE name = 'Transport'), 10),
('NETFLIX', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('SPOTIFY', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('PLAYSTATION', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('XBOX', (SELECT id FROM categories WHERE name = 'Entertainment'), 10),
('COSTA', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('STARBUCKS', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('PRET', (SELECT id FROM categories WHERE name = 'Dining'), 10),
('RESTAURANT', (SELECT id FROM categories WHERE name = 'Dining'), 5),
('CAFE', (SELECT id FROM categories WHERE name = 'Dining'), 5),
('COFFEE', (SELECT id FROM categories WHERE name = 'Dining'), 5);

-- CMS Pages (Privacy Policy and Terms of Service)
INSERT OR IGNORE INTO cms_pages (slug, title, content, css, meta_title, meta_description, is_published, created_at, updated_at) VALUES
('privacy', 'Privacy Policy', '<div class="cms-legal-page">
  <p class="cms-last-updated">Last updated: January 2026</p>

  <h2>Introduction</h2>
  <p>FinanceFlow ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our personal finance management application.</p>

  <h2>Information We Collect</h2>

  <h3>Information You Provide</h3>
  <ul>
    <li><strong>Account Information:</strong> Email address, username, and password when you create an account</li>
    <li><strong>Financial Data:</strong> Bank account details, transaction data, and categorisation information you input into the application</li>
    <li><strong>Communication Data:</strong> Information you provide when contacting us for support</li>
  </ul>

  <h3>Information Collected Automatically</h3>
  <ul>
    <li><strong>Usage Data:</strong> How you interact with our application, features used, and time spent</li>
    <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers</li>
    <li><strong>Log Data:</strong> IP address, access times, and pages viewed</li>
  </ul>

  <h2>How We Use Your Information</h2>
  <p>We use your information to:</p>
  <ul>
    <li>Provide and maintain our personal finance management services</li>
    <li>Process and categorise your financial transactions</li>
    <li>Generate reports and insights about your spending habits</li>
    <li>Send you service updates and important notifications</li>
    <li>Respond to your support requests</li>
    <li>Improve our application and develop new features</li>
    <li>Ensure the security of your account</li>
  </ul>

  <h2>Data Security</h2>
  <p>We implement appropriate technical and organisational measures to protect your personal data:</p>
  <ul>
    <li>Encryption of data in transit and at rest</li>
    <li>Secure password hashing using bcrypt</li>
    <li>Session management with secure, HTTP-only cookies</li>
    <li>Regular security assessments</li>
    <li>Access controls and authentication requirements</li>
  </ul>

  <h2>Data Retention</h2>
  <p>We retain your personal data for as long as your account is active or as needed to provide you services. You can request deletion of your account and associated data at any time.</p>

  <h2>Your Rights</h2>
  <p>Under UK GDPR, you have the right to:</p>
  <ul>
    <li>Access your personal data</li>
    <li>Rectify inaccurate data</li>
    <li>Request deletion of your data</li>
    <li>Object to processing of your data</li>
    <li>Data portability</li>
    <li>Withdraw consent</li>
  </ul>

  <h2>Third-Party Services</h2>
  <p>We may use third-party services for:</p>
  <ul>
    <li><strong>Payment Processing:</strong> Stripe for subscription payments (if applicable)</li>
    <li><strong>Email Services:</strong> For sending transactional emails</li>
  </ul>
  <p>These providers have their own privacy policies governing how they handle your data.</p>

  <h2>Cookies</h2>
  <p>We use essential cookies for authentication and session management. These are necessary for the application to function properly.</p>

  <h2>Changes to This Policy</h2>
  <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>

  <h2>Contact Us</h2>
  <p>If you have questions about this Privacy Policy or wish to exercise your rights, please contact us at:</p>
  <p><a href="/contact">Contact Us</a></p>
</div>', '.cms-legal-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
  line-height: 1.8;
}

.cms-legal-page h2 {
  color: #1a1a2e;
  margin-top: 2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #14b8a6;
}

.cms-legal-page h3 {
  color: #374151;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.cms-legal-page p {
  margin-bottom: 1rem;
  color: #4b5563;
}

.cms-legal-page ul {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.cms-legal-page li {
  margin-bottom: 0.5rem;
  color: #4b5563;
}

.cms-legal-page strong {
  color: #1a1a2e;
}

.cms-last-updated {
  color: #6b7280;
  font-style: italic;
  margin-bottom: 2rem;
}

.cms-legal-page a {
  color: #14b8a6;
  text-decoration: none;
}

.cms-legal-page a:hover {
  text-decoration: underline;
}', 'Privacy Policy - FinanceFlow', 'Learn how FinanceFlow collects, uses, and protects your personal and financial information.', 1, datetime('now'), datetime('now')),

('terms', 'Terms of Service', '<div class="cms-legal-page">
  <p class="cms-last-updated">Last updated: January 2026</p>

  <h2>Agreement to Terms</h2>
  <p>By accessing or using FinanceFlow, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access the service.</p>

  <h2>Description of Service</h2>
  <p>FinanceFlow is a personal finance management application that allows you to:</p>
  <ul>
    <li>Track and categorise financial transactions</li>
    <li>Import bank statements (CSV, OFX formats)</li>
    <li>View spending reports and analytics</li>
    <li>Manage multiple bank accounts</li>
    <li>Set up automatic transaction categorisation rules</li>
  </ul>

  <h2>User Accounts</h2>
  <h3>Account Creation</h3>
  <p>To use FinanceFlow, you must create an account with:</p>
  <ul>
    <li>A valid email address</li>
    <li>A secure password meeting our complexity requirements</li>
  </ul>

  <h3>Account Security</h3>
  <p>You are responsible for:</p>
  <ul>
    <li>Maintaining the confidentiality of your account credentials</li>
    <li>All activities that occur under your account</li>
    <li>Notifying us immediately of any unauthorised access</li>
  </ul>

  <h2>Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Use the service for any illegal purpose</li>
    <li>Attempt to gain unauthorised access to our systems</li>
    <li>Upload malicious code or attempt to harm the service</li>
    <li>Share your account with others</li>
    <li>Use the service to store data unrelated to personal finance</li>
    <li>Reverse engineer or attempt to extract our source code</li>
  </ul>

  <h2>Data Ownership</h2>
  <p>You retain ownership of all financial data you input into FinanceFlow. We do not claim any ownership rights over your personal financial information.</p>

  <h2>Service Availability</h2>
  <p>We strive to maintain high availability but cannot guarantee uninterrupted access. We may:</p>
  <ul>
    <li>Perform maintenance that temporarily affects service</li>
    <li>Modify or discontinue features with notice</li>
    <li>Suspend accounts that violate these terms</li>
  </ul>

  <h2>Subscription and Payments</h2>
  <p>FinanceFlow offers:</p>
  <ul>
    <li><strong>Free Tier:</strong> Basic features at no cost</li>
    <li><strong>Pro Tier:</strong> Advanced features for £7.99/month</li>
  </ul>
  <p>Subscriptions are billed monthly and can be cancelled at any time. Refunds are not provided for partial months.</p>

  <h2>Limitation of Liability</h2>
  <p>FinanceFlow is provided "as is" without warranties of any kind. We are not liable for:</p>
  <ul>
    <li>Financial decisions made based on data in the application</li>
    <li>Data loss due to circumstances beyond our control</li>
    <li>Indirect, incidental, or consequential damages</li>
  </ul>
  <p>Our total liability is limited to the amount you paid us in the 12 months preceding the claim.</p>

  <h2>Intellectual Property</h2>
  <p>The FinanceFlow name, logo, and application design are our intellectual property. You may not use these without our written permission.</p>

  <h2>Termination</h2>
  <p>We may terminate or suspend your account if you:</p>
  <ul>
    <li>Violate these Terms of Service</li>
    <li>Engage in fraudulent activity</li>
    <li>Fail to pay subscription fees</li>
  </ul>
  <p>You may terminate your account at any time through the application settings.</p>

  <h2>Changes to Terms</h2>
  <p>We may modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.</p>

  <h2>Governing Law</h2>
  <p>These terms are governed by the laws of England and Wales. Any disputes will be resolved in the courts of England and Wales.</p>

  <h2>Contact</h2>
  <p>For questions about these Terms of Service, please <a href="/contact">contact us</a>.</p>
</div>', '.cms-legal-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
  line-height: 1.8;
}

.cms-legal-page h2 {
  color: #1a1a2e;
  margin-top: 2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #14b8a6;
}

.cms-legal-page h3 {
  color: #374151;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.cms-legal-page p {
  margin-bottom: 1rem;
  color: #4b5563;
}

.cms-legal-page ul {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.cms-legal-page li {
  margin-bottom: 0.5rem;
  color: #4b5563;
}

.cms-legal-page strong {
  color: #1a1a2e;
}

.cms-last-updated {
  color: #6b7280;
  font-style: italic;
  margin-bottom: 2rem;
}

.cms-legal-page a {
  color: #14b8a6;
  text-decoration: none;
}

.cms-legal-page a:hover {
  text-decoration: underline;
}', 'Terms of Service - FinanceFlow', 'Read the terms and conditions for using FinanceFlow personal finance management application.', 1, datetime('now'), datetime('now'));
