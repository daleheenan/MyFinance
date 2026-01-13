# Advanced Features Research Document

**Features Covered:**
1. AI-Powered Personal Insights Engine
2. Cash Flow Forecasting 2.0
3. Smart Bill Optimization

---

## 1. AI-Powered Personal Insights Engine

### Overview

An AI-powered insights engine analyzes user financial behavior patterns to generate personalized, actionable recommendations. Unlike static dashboards, it proactively surfaces insights the user might not think to look for.

### How It Works

#### Data Analysis Layer
The engine continuously analyzes:
- **Spending patterns**: Weekly/monthly rhythms, category distributions, merchant frequency
- **Income patterns**: Regular vs irregular income, timing of deposits
- **Behavioral patterns**: Time of day for purchases, weekend vs weekday spending
- **Historical trends**: Month-over-month changes, seasonal variations
- **External data**: Inflation rates, typical costs for area (if available)

#### Insight Generation Types

**1. Pattern Recognition Insights**
- "You typically spend £150 more in December - plan ahead!"
- "Your grocery spending increased 25% this month compared to your 6-month average"
- "You've ordered from Deliveroo 12 times this month - that's £180 vs cooking at home"

**2. Predictive Insights**
- "At your current spending rate, you'll have £230 left at month end"
- "If you cut subscriptions by 20%, you'd save £456/year"
- "Your emergency fund will reach 3 months expenses in 8 weeks at current savings rate"

**3. Opportunity Insights**
- "Switching your £12.99/month subscription to annual billing saves £26/year"
- "You're paying for 3 streaming services - Netflix, Disney+, Prime. Consider rotating?"
- "Your energy direct debit could be lower - you're £50 in credit"

**4. Achievement Insights**
- "You saved 15% of income this month - your best month yet!"
- "No eating out this week - that's unusual for you. Keep it up!"
- "You've reduced transport spending for 3 months straight"

### Technical Implementation

#### Architecture Options

**Option A: Rule-Based System (Recommended for Phase 1)**
- Define insight templates with thresholds
- SQL queries identify when conditions are met
- Prioritize by impact and novelty

```javascript
// Example rule structure
const insightRules = [
  {
    id: 'category_spike',
    query: 'Category spending > 150% of 3-month average',
    template: 'Your {category} spending is {percent}% higher than usual',
    priority: (percent) => percent > 200 ? 'high' : 'medium',
    cooldown: 7 // days before showing again
  }
];
```

**Option B: ML-Based System (Future)**
- Train models on anonymized aggregate data
- Detect anomalies using isolation forests
- Generate natural language insights with LLM
- Requires more data and compute resources

#### Database Requirements

```sql
-- User insights table
CREATE TABLE user_insights (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    insight_type TEXT NOT NULL,
    insight_key TEXT NOT NULL,  -- Unique key for this insight
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    action_url TEXT,
    data JSON,  -- Supporting data for the insight
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    viewed_at TEXT,
    dismissed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_insights_user_unviewed ON user_insights(user_id)
  WHERE viewed_at IS NULL AND dismissed_at IS NULL;
```

#### API Endpoints

```
GET  /api/insights/feed          - Paginated insights feed
GET  /api/insights/summary       - Top 3 priority insights
POST /api/insights/:id/view      - Mark insight as viewed
POST /api/insights/:id/dismiss   - Dismiss insight
POST /api/insights/generate      - Trigger insight generation (admin/cron)
```

### UI/UX Design Considerations

1. **Insights Feed**: Dedicated page with filterable insights
2. **Overview Widget**: "Today's Insights" card on dashboard
3. **Notification Badges**: Indicate new insights in nav
4. **Actionable CTAs**: Each insight links to relevant action

### Estimated Effort

- **Phase 1 (Rule-Based)**: 2-3 weeks
  - Database schema and service layer
  - 10-15 initial insight rules
  - Basic frontend feed and widget

- **Phase 2 (Enhanced)**: 3-4 weeks
  - Natural language variation
  - User preference learning (don't show dismissed categories)
  - Scheduled generation and notification

---

## 2. Cash Flow Forecasting 2.0

### Overview

Enhanced cash flow forecasting that goes beyond simple averages to provide accurate, actionable predictions with scenario modeling and what-if analysis.

### Current Limitations

The existing forecasting uses:
- Simple monthly averages for income and expenses
- Basic scenario multipliers (optimistic, conservative)
- Limited consideration of recurring patterns

### Proposed Enhancements

#### A. Pattern-Aware Predictions

**Recurring Detection Integration**
- Incorporate known recurring bills into predictions
- Account for subscription billing dates
- Handle salary timing (mid-month, end-of-month)

**Seasonal Adjustments**
- December spending historically higher
- Summer holiday spending patterns
- Quarterly expenses (insurance, car service)

**One-Off Detection**
- Identify and exclude one-off expenses from baseline
- Track large purchases that skew averages

#### B. What-If Scenario Builder

Allow users to model scenarios:

```javascript
// Example scenarios
const scenarios = [
  {
    name: "Cancel Netflix",
    changes: [{ type: 'subscription', action: 'remove', id: 45 }],
    impact: { monthly: +15.99, yearly: +191.88 }
  },
  {
    name: "New Car Payment",
    changes: [{ type: 'expense', category: 'Transport', amount: 350, frequency: 'monthly' }],
    impact: { monthly: -350, yearly: -4200 }
  },
  {
    name: "Pay Rise",
    changes: [{ type: 'income', percentChange: 5 }],
    impact: { monthly: +200, yearly: +2400 }
  }
];
```

#### C. Confidence Levels

Show prediction confidence based on:
- Data consistency (coefficient of variation)
- Time since last update
- Number of data points

```
High confidence: CV < 10%, 6+ months data
Medium confidence: CV 10-30%, 3+ months data
Low confidence: CV > 30% or < 3 months data
```

#### D. Alert Thresholds

Proactive warnings:
- "Balance projected to go negative on March 15th"
- "Savings rate will drop below 10% next month"
- "Emergency fund goal at risk - need £200 more this month"

### Technical Implementation

#### Enhanced Forecast Service

```javascript
function generateEnhancedForecast(userId, months = 6) {
  return {
    baseline: calculateBaselineForecast(userId, months),
    withRecurring: calculateWithRecurring(userId, months),
    scenarios: [
      { name: 'Best Case', data: calculateScenario(userId, 'optimistic') },
      { name: 'Expected', data: calculateScenario(userId, 'expected') },
      { name: 'Worst Case', data: calculateScenario(userId, 'conservative') }
    ],
    alerts: detectForecastAlerts(userId, months),
    confidence: calculateConfidenceLevel(userId),
    assumptions: listForecastAssumptions(userId)
  };
}
```

#### New Database Tables

```sql
-- Forecast scenarios (user-created)
CREATE TABLE forecast_scenarios (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    changes JSON NOT NULL,  -- Array of changes
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Forecast alerts
CREATE TABLE forecast_alerts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,  -- negative_balance, goal_at_risk, etc.
    target_date TEXT,
    details JSON,
    is_dismissed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### UI Components

1. **Interactive Chart**: Drag to adjust scenario parameters
2. **Scenario Builder Modal**: Add/remove income/expenses
3. **Confidence Indicator**: Visual representation of prediction accuracy
4. **Alert Banner**: Proactive warnings on dashboard

### Estimated Effort

- **Phase 1 (Pattern-Aware)**: 2 weeks
  - Integrate recurring patterns
  - Seasonal adjustments
  - Confidence scoring

- **Phase 2 (Scenario Builder)**: 2-3 weeks
  - User scenario CRUD
  - Interactive what-if chart
  - Impact calculations

- **Phase 3 (Alerts)**: 1 week
  - Alert generation logic
  - Dashboard integration
  - Notification system

---

## 3. Smart Bill Optimization

### Overview

Intelligent analysis of recurring bills and subscriptions to identify savings opportunities, suggest optimizations, and track progress on reducing fixed costs.

### Feature Components

#### A. Subscription Audit

**Duplicate/Overlap Detection**
- Multiple music streaming services
- Redundant cloud storage
- Similar news/media subscriptions

**Usage vs Cost Analysis**
- Compare subscription cost to usage frequency
- Identify rarely-used subscriptions
- Calculate cost per use

**Price Change Detection**
- Track historical subscription prices
- Alert when a subscription increases
- Show total annual impact of increases

#### B. Bill Optimization Suggestions

**Billing Frequency Optimization**
- Identify subscriptions offering annual discounts
- Calculate savings for switching to annual
- Alert before annual renewal to reconsider

**Alternative Suggestions** (requires external data)
- Cheaper alternatives for similar services
- Bundle opportunities (e.g., Apple One vs individual)
- Student/family plan opportunities

**Negotiation Opportunities**
- Long-term subscriber discounts
- Loyalty retention offers
- Competitor price matching

#### C. Fixed Cost Management

**Bill Calendar Integration**
- Map all recurring payments to calendar
- Identify high-cost periods
- Suggest spreading payments across month

**Payment Method Optimization**
- Direct debit discounts
- Cashback card opportunities
- Points/rewards optimization

### Technical Implementation

#### Subscription Analysis Service

```javascript
function analyzeSubscriptions(userId) {
  return {
    summary: {
      totalMonthly: calculateMonthlyTotal(userId),
      totalYearly: calculateYearlyTotal(userId),
      percentOfIncome: calculatePercentOfIncome(userId),
      count: getActiveSubscriptionCount(userId)
    },
    opportunities: {
      unused: findUnusedSubscriptions(userId),  // No charge in 45+ days
      duplicates: findDuplicateServices(userId),
      priceIncreases: findRecentPriceIncreases(userId),
      annualSavings: findAnnualBillingOpportunities(userId)
    },
    optimizations: generateOptimizationSuggestions(userId),
    timeline: {
      upcomingRenewals: getUpcomingRenewals(userId, 30),
      recentChanges: getRecentSubscriptionChanges(userId)
    }
  };
}

function findDuplicateServices(userId) {
  // Categories with multiple active subscriptions
  const categories = {
    'streaming': ['Netflix', 'Disney+', 'Prime Video', 'Apple TV+', 'Now TV'],
    'music': ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music'],
    'storage': ['iCloud', 'Google One', 'Dropbox', 'OneDrive'],
    'fitness': ['Strava', 'MyFitnessPal', 'Peloton', 'Apple Fitness+']
  };

  // Match user subscriptions to categories
  // Return categories with 2+ active subscriptions
}

function findAnnualBillingOpportunities(userId) {
  // Find monthly subscriptions that offer annual discounts
  // Common discount: 2 months free on annual (16.67% savings)
  // Return: subscription, current annual cost, potential savings
}
```

#### Database Additions

```sql
-- Subscription price history
CREATE TABLE subscription_price_history (
    id INTEGER PRIMARY KEY,
    subscription_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- Bill optimization suggestions
CREATE TABLE bill_optimization_suggestions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    suggestion_type TEXT NOT NULL,
    subscription_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    potential_savings REAL,
    confidence TEXT DEFAULT 'medium',
    is_dismissed INTEGER DEFAULT 0,
    actioned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
```

#### API Endpoints

```
GET  /api/bills/analysis          - Full subscription analysis
GET  /api/bills/opportunities     - Savings opportunities
GET  /api/bills/duplicates        - Duplicate service detection
POST /api/bills/suggestions/:id/dismiss  - Dismiss suggestion
POST /api/bills/suggestions/:id/action   - Mark as actioned
```

### UI Components

1. **Bill Audit Dashboard**: Overview of all subscriptions with health indicators
2. **Optimization Cards**: Actionable savings suggestions with impact
3. **Price History Chart**: Track subscription cost over time
4. **Renewal Calendar**: Visual timeline of upcoming renewals
5. **Progress Tracker**: Track savings from implemented optimizations

### Sample UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Bill Optimization                                           │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ £187.50/mo  │ │ 12 Active   │ │ £450/year   │            │
│ │ Total Bills │ │ Subscriptions│ │ Potential   │            │
│ │             │ │             │ │ Savings     │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│ 🔴 High Priority                                            │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Multiple Streaming Services Detected                   │  │
│ │ Netflix (£15.99) + Disney+ (£10.99) + Prime (£8.99)   │  │
│ │ Consider: Rotate services monthly to save ~£20/mo     │  │
│ │ [Dismiss] [Set Reminder]                              │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ 🟡 Opportunities                                            │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Switch Spotify to Annual Billing                       │  │
│ │ Current: £10.99/mo = £131.88/year                     │  │
│ │ Annual: £109/year - Save £22.88/year                  │  │
│ │ [Dismiss] [Switch Now]                                │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Estimated Effort

- **Phase 1 (Analysis)**: 1-2 weeks
  - Subscription categorization
  - Duplicate detection
  - Usage analysis

- **Phase 2 (Suggestions)**: 2 weeks
  - Optimization rule engine
  - Savings calculations
  - UI components

- **Phase 3 (Tracking)**: 1 week
  - Price history tracking
  - Progress dashboard
  - Actioned savings total

---

## Implementation Roadmap Summary

| Feature | Phase 1 | Phase 2 | Phase 3 | Total |
|---------|---------|---------|---------|-------|
| AI Insights Engine | 2-3 weeks | 3-4 weeks | - | 5-7 weeks |
| Forecasting 2.0 | 2 weeks | 2-3 weeks | 1 week | 5-6 weeks |
| Bill Optimization | 1-2 weeks | 2 weeks | 1 week | 4-5 weeks |

**Recommended Implementation Order:**
1. Bill Optimization (quickest wins, immediate user value)
2. Forecasting 2.0 (builds on existing functionality)
3. AI Insights Engine (most complex, requires more data patterns)

---

## Success Metrics

### AI Insights Engine
- Weekly active insight viewers
- Insight-to-action conversion rate
- User satisfaction with insight relevance (survey)
- Reduction in "surprised" overspending

### Forecasting 2.0
- Forecast accuracy (actual vs predicted)
- Scenario builder usage rate
- Alert engagement rate
- User-reported confidence in financial planning

### Bill Optimization
- Total identified savings per user
- Percentage of suggestions actioned
- Average monthly subscription reduction
- User retention improvement (users who optimize stay longer)
