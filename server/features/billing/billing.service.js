/**
 * Billing Service
 *
 * Handles Stripe subscription management and payment processing.
 * Configure via environment variables:
 *   - STRIPE_SECRET_KEY: Stripe secret API key
 *   - STRIPE_WEBHOOK_SECRET: Stripe webhook signing secret
 *   - STRIPE_PRO_PRICE_ID: Price ID for Pro subscription
 */

import Stripe from 'stripe';

// Initialize Stripe with API key (if configured)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Price IDs from environment
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;
const PRO_MONTHLY_AMOUNT = 799; // £7.99 in pence

/**
 * Check if Stripe is configured
 * @returns {boolean}
 */
export function isStripeConfigured() {
  return !!(stripe && PRO_PRICE_ID);
}

/**
 * Get or create Stripe customer for user
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<string>} Stripe customer ID
 */
export async function getOrCreateCustomer(db, userId, email) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  // Check if user already has a customer ID
  const subscription = db.prepare(
    'SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?'
  ).get(userId);

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId: userId.toString()
    }
  });

  // Store customer ID
  db.prepare(`
    INSERT INTO user_subscriptions (user_id, stripe_customer_id)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      updated_at = datetime('now')
  `).run(userId, customer.id);

  return customer.id;
}

/**
 * Get user's current subscription status
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @returns {object} Subscription info
 */
export function getSubscriptionStatus(db, userId) {
  const subscription = db.prepare(`
    SELECT plan, status, current_period_start, current_period_end, cancel_at_period_end
    FROM user_subscriptions
    WHERE user_id = ?
  `).get(userId);

  if (!subscription) {
    return {
      plan: 'free',
      status: 'inactive',
      isActive: false,
      isPro: false
    };
  }

  const isActive = subscription.status === 'active' || subscription.status === 'trialing';
  const isPro = isActive && subscription.plan === 'pro';

  return {
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    isActive,
    isPro
  };
}

/**
 * Create a checkout session for Pro subscription
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} email - User email
 * @param {string} successUrl - URL to redirect on success
 * @param {string} cancelUrl - URL to redirect on cancel
 * @returns {Promise<{sessionId: string, url: string}>}
 */
export async function createCheckoutSession(db, userId, email, successUrl, cancelUrl) {
  if (!stripe || !PRO_PRICE_ID) {
    throw new Error('Stripe not configured');
  }

  const customerId = await getOrCreateCustomer(db, userId, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{
      price: PRO_PRICE_ID,
      quantity: 1
    }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: userId.toString()
    }
  });

  return {
    sessionId: session.id,
    url: session.url
  };
}

/**
 * Create a billing portal session for managing subscription
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} returnUrl - URL to return to after portal
 * @returns {Promise<{url: string}>}
 */
export async function createPortalSession(db, userId, returnUrl) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const subscription = db.prepare(
    'SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?'
  ).get(userId);

  if (!subscription?.stripe_customer_id) {
    throw new Error('No subscription found');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: returnUrl
  });

  return { url: session.url };
}

/**
 * Cancel subscription at period end
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean}>}
 */
export async function cancelSubscription(db, userId) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const subscription = db.prepare(
    'SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?'
  ).get(userId);

  if (!subscription?.stripe_subscription_id) {
    throw new Error('No active subscription found');
  }

  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    cancel_at_period_end: true
  });

  db.prepare(`
    UPDATE user_subscriptions
    SET cancel_at_period_end = 1, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);

  return { success: true };
}

/**
 * Resume a canceled subscription
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean}>}
 */
export async function resumeSubscription(db, userId) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const subscription = db.prepare(
    'SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?'
  ).get(userId);

  if (!subscription?.stripe_subscription_id) {
    throw new Error('No subscription found');
  }

  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    cancel_at_period_end: false
  });

  db.prepare(`
    UPDATE user_subscriptions
    SET cancel_at_period_end = 0, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);

  return { success: true };
}

/**
 * Get payment history for user
 * @param {Database} db - Database instance
 * @param {number} userId - User ID
 * @param {number} limit - Max records to return
 * @returns {object[]} Payment history
 */
export function getPaymentHistory(db, userId, limit = 20) {
  return db.prepare(`
    SELECT id, amount, currency, status, description, created_at
    FROM payment_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit).map(p => ({
    ...p,
    amountFormatted: (p.amount / 100).toFixed(2)
  }));
}

/**
 * Handle Stripe webhook events
 * @param {Database} db - Database instance
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Promise<{received: boolean}>}
 */
export async function handleWebhook(db, rawBody, signature) {
  if (!stripe) {
    throw new Error('Stripe not configured');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    throw new Error('Invalid webhook signature');
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await handleCheckoutComplete(db, session);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await handleSubscriptionUpdate(db, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await handleSubscriptionDeleted(db, subscription);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      await handleInvoicePaid(db, invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await handlePaymentFailed(db, invoice);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return { received: true };
}

// Internal webhook handlers

async function handleCheckoutComplete(db, session) {
  const userId = parseInt(session.metadata?.userId);
  if (!userId) return;

  // Subscription is created via customer.subscription.created webhook
  console.log(`Checkout completed for user ${userId}`);
}

async function handleSubscriptionUpdate(db, subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer);
  const userId = parseInt(customer.metadata?.userId);
  if (!userId) return;

  const status = mapStripeStatus(subscription.status);
  const plan = subscription.items.data[0]?.price?.id === PRO_PRICE_ID ? 'pro' : 'free';

  db.prepare(`
    UPDATE user_subscriptions SET
      stripe_subscription_id = ?,
      plan = ?,
      status = ?,
      current_period_start = ?,
      current_period_end = ?,
      cancel_at_period_end = ?,
      updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    subscription.id,
    plan,
    status,
    new Date(subscription.current_period_start * 1000).toISOString(),
    new Date(subscription.current_period_end * 1000).toISOString(),
    subscription.cancel_at_period_end ? 1 : 0,
    userId
  );

  console.log(`Subscription updated for user ${userId}: ${plan} - ${status}`);
}

async function handleSubscriptionDeleted(db, subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer);
  const userId = parseInt(customer.metadata?.userId);
  if (!userId) return;

  db.prepare(`
    UPDATE user_subscriptions SET
      plan = 'free',
      status = 'canceled',
      stripe_subscription_id = NULL,
      updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);

  console.log(`Subscription deleted for user ${userId}`);
}

async function handleInvoicePaid(db, invoice) {
  const customer = await stripe.customers.retrieve(invoice.customer);
  const userId = parseInt(customer.metadata?.userId);
  if (!userId) return;

  db.prepare(`
    INSERT INTO payment_history (user_id, stripe_invoice_id, amount, currency, status, description)
    VALUES (?, ?, ?, ?, 'succeeded', ?)
  `).run(
    userId,
    invoice.id,
    invoice.amount_paid,
    invoice.currency,
    invoice.lines.data[0]?.description || 'Subscription payment'
  );

  console.log(`Invoice paid for user ${userId}: ${invoice.amount_paid / 100} ${invoice.currency}`);
}

async function handlePaymentFailed(db, invoice) {
  const customer = await stripe.customers.retrieve(invoice.customer);
  const userId = parseInt(customer.metadata?.userId);
  if (!userId) return;

  db.prepare(`
    INSERT INTO payment_history (user_id, stripe_invoice_id, amount, currency, status, description)
    VALUES (?, ?, ?, ?, 'failed', ?)
  `).run(
    userId,
    invoice.id,
    invoice.amount_due,
    invoice.currency,
    'Payment failed'
  );

  // Update subscription status
  db.prepare(`
    UPDATE user_subscriptions SET status = 'past_due', updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);

  console.log(`Payment failed for user ${userId}`);
}

function mapStripeStatus(stripeStatus) {
  const statusMap = {
    'active': 'active',
    'past_due': 'past_due',
    'canceled': 'canceled',
    'unpaid': 'past_due',
    'trialing': 'trialing',
    'incomplete': 'inactive',
    'incomplete_expired': 'inactive'
  };
  return statusMap[stripeStatus] || 'inactive';
}
