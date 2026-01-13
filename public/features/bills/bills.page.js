/**
 * Bills Calendar Page
 * View upcoming bills in a calendar format with predictions
 */

import { api } from '../../core/api.js';
import { formatCurrency, escapeHtml } from '../../core/utils.js';

// Private state
let container = null;
let cleanupFunctions = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let calendarData = null;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function onCleanup(fn) {
  cleanupFunctions.push(fn);
}

export async function mount(el, params) {
  container = el;
  cleanupFunctions = [];
  loadStyles();
  render();
  attachEventListeners();
  await loadData();
}

export function unmount() {
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions = [];
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

function loadStyles() {
  const styleId = 'bills-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = 'features/bills/bills.css';
    document.head.appendChild(link);
  }
}

function render() {
  container.innerHTML = `
    <div class="page bills-page">
      <header class="page-header">
        <div class="page-header__content">
          <h1>Bill Calendar</h1>
          <p class="page-header__subtitle">Track your upcoming bills and payment schedule</p>
        </div>
      </header>

      <section id="summary-container" class="bills-summary">
        <div class="loading">
          <div class="spinner"></div>
        </div>
      </section>

      <section class="calendar-section">
        <div class="calendar-header">
          <button class="btn btn-ghost" id="prev-month">&larr; Previous</button>
          <h2 id="month-title">${MONTH_NAMES[currentMonth - 1]} ${currentYear}</h2>
          <button class="btn btn-ghost" id="next-month">Next &rarr;</button>
        </div>
        <div id="calendar-container" class="calendar">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading calendar...</p>
          </div>
        </div>
      </section>

      <section id="upcoming-container" class="upcoming-section">
        <div class="loading">
          <div class="spinner"></div>
        </div>
      </section>
    </div>
  `;
}

function attachEventListeners() {
  container.addEventListener('click', handleClick);
  onCleanup(() => container.removeEventListener('click', handleClick));
}

async function handleClick(e) {
  if (e.target.id === 'prev-month' || e.target.closest('#prev-month')) {
    currentMonth--;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear--;
    }
    updateMonthTitle();
    await loadCalendar();
  } else if (e.target.id === 'next-month' || e.target.closest('#next-month')) {
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    updateMonthTitle();
    await loadCalendar();
  }
}

function updateMonthTitle() {
  const titleEl = document.getElementById('month-title');
  if (titleEl) {
    titleEl.textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
  }
}

async function loadData() {
  await Promise.all([
    loadSummary(),
    loadCalendar(),
    loadUpcoming()
  ]);
}

async function loadSummary() {
  try {
    const response = await api.get('/bills/summary');
    renderSummary(response.data || response);
  } catch (err) {
    console.error('Failed to load bill summary:', err);
  }
}

async function loadCalendar() {
  try {
    const response = await api.get(`/bills/calendar?year=${currentYear}&month=${currentMonth}`);
    calendarData = response.data || response;
    renderCalendar();
  } catch (err) {
    console.error('Failed to load calendar:', err);
  }
}

async function loadUpcoming() {
  try {
    const response = await api.get('/bills/upcoming?days=14');
    renderUpcoming(response.data || response);
  } catch (err) {
    console.error('Failed to load upcoming bills:', err);
  }
}

function renderSummary(summary) {
  const el = document.getElementById('summary-container');
  if (!el || !summary) return;

  const { thisMonth, lastMonth, comparison } = summary;
  const changeIcon = comparison.vsLastMonth > 0 ? '&uarr;' : comparison.vsLastMonth < 0 ? '&darr;' : '&rarr;';
  const changeColor = comparison.vsLastMonth > 5 ? 'red' : comparison.vsLastMonth < -5 ? 'green' : 'yellow';

  el.innerHTML = `
    <div class="summary-cards">
      <div class="summary-card">
        <span class="summary-card__label">Paid This Month</span>
        <span class="summary-card__value">${formatCurrency(thisMonth.paid)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">Still Due</span>
        <span class="summary-card__value summary-card__value--warning">${formatCurrency(thisMonth.upcoming)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">Total Expected</span>
        <span class="summary-card__value">${formatCurrency(thisMonth.total)}</span>
      </div>
      <div class="summary-card">
        <span class="summary-card__label">vs Last Month</span>
        <span class="summary-card__value summary-card__value--${changeColor}">
          <span class="change-icon">${changeIcon}</span>
          ${Math.abs(Math.round(comparison.vsLastMonth))}%
        </span>
      </div>
    </div>
  `;
}

function renderCalendar() {
  const el = document.getElementById('calendar-container');
  if (!el || !calendarData) return;

  const { calendar } = calendarData;
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday start

  el.innerHTML = `
    <div class="calendar-grid">
      <div class="calendar-day-header">Mon</div>
      <div class="calendar-day-header">Tue</div>
      <div class="calendar-day-header">Wed</div>
      <div class="calendar-day-header">Thu</div>
      <div class="calendar-day-header">Fri</div>
      <div class="calendar-day-header">Sat</div>
      <div class="calendar-day-header">Sun</div>

      ${Array(adjustedFirstDay).fill('<div class="calendar-day calendar-day--empty"></div>').join('')}

      ${calendar.map(day => {
        const hasUpcoming = day.bills.some(b => b.status === 'upcoming' || b.status === 'due');
        const hasPaid = day.bills.some(b => b.status === 'paid');

        return `
          <div class="calendar-day ${day.isToday ? 'calendar-day--today' : ''} ${day.isPast ? 'calendar-day--past' : ''} ${hasUpcoming ? 'calendar-day--has-upcoming' : ''} ${hasPaid ? 'calendar-day--has-paid' : ''}">
            <span class="calendar-day__number">${day.day}</span>
            ${day.bills.length > 0 ? `
              <div class="calendar-day__bills">
                ${day.bills.slice(0, 3).map(bill => `
                  <div class="calendar-bill calendar-bill--${bill.status}" title="${escapeHtml(bill.name)}: ${formatCurrency(bill.amount)}">
                    <span class="calendar-bill__name">${escapeHtml(bill.name.substring(0, 10))}${bill.name.length > 10 ? '...' : ''}</span>
                  </div>
                `).join('')}
                ${day.bills.length > 3 ? `
                  <div class="calendar-bill calendar-bill--more">+${day.bills.length - 3} more</div>
                ` : ''}
              </div>
            ` : ''}
            ${day.total > 0 ? `
              <span class="calendar-day__total">${formatCurrency(day.total)}</span>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>

    <div class="calendar-legend">
      <div class="legend-item"><span class="legend-dot legend-dot--paid"></span> Paid</div>
      <div class="legend-item"><span class="legend-dot legend-dot--due"></span> Due Today</div>
      <div class="legend-item"><span class="legend-dot legend-dot--upcoming"></span> Upcoming</div>
    </div>
  `;
}

function renderUpcoming(bills) {
  const el = document.getElementById('upcoming-container');
  if (!el) return;

  if (!bills || bills.length === 0) {
    el.innerHTML = `
      <div class="upcoming-card card">
        <h3>Next 14 Days</h3>
        <div class="empty-state empty-state--compact">
          <p>No upcoming bills in the next 14 days</p>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="upcoming-card card">
      <h3>Next 14 Days</h3>
      <div class="upcoming-list">
        ${bills.map(bill => `
          <div class="upcoming-bill">
            <div class="upcoming-bill__date">
              <span class="upcoming-bill__day">${new Date(bill.date).getDate()}</span>
              <span class="upcoming-bill__month">${MONTH_NAMES[new Date(bill.date).getMonth()].substring(0, 3)}</span>
            </div>
            <div class="upcoming-bill__details">
              <span class="upcoming-bill__name">${escapeHtml(bill.name)}</span>
              ${bill.category ? `<span class="upcoming-bill__category" style="color: ${bill.colour || '#888'}">${escapeHtml(bill.category)}</span>` : ''}
            </div>
            <div class="upcoming-bill__amount">
              ${formatCurrency(bill.amount)}
            </div>
            <div class="upcoming-bill__days">
              ${bill.daysUntil === 0 ? 'Today' : bill.daysUntil === 1 ? 'Tomorrow' : `${bill.daysUntil} days`}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
