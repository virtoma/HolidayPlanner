/* Accessibility & state */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  startDate: null,
  endDate: null,
  quota: 0,
  weekdaysOnly: true,
  excludeHolidays: true,
  theme: 'auto',
  days: new Map() // key: YYYY-MM-DD, value: 'none' | 'full' | 'half'
};

function formatDateISO(d) {
  return d.toISOString().slice(0,10);
}

function todayISO() {
  return formatDateISO(new Date());
}

function parseISO(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}

function isWeekend(d) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  return day === 0 || day === 6;
}

// Placeholder Belgian holidays; vervang met volledige lijst indien nodig
const HOLIDAYS = new Set([
  // Nieuwjaar, Pasen (variabel), ... -> voorbeeld
  '2025-01-01', '2025-04-21', '2025-05-01', '2025-05-29',
  '2025-06-09', '2025-07-21', '2025-08-15', '2025-11-01',
  '2025-11-11', '2025-12-25'
]);

function isHoliday(d) {
  return HOLIDAYS.has(formatDateISO(d));
}

function dayClass(d, value) {
  if (isHoliday(d)) return 'day holiday';
  let cls = 'day';
  if (value === 'full') cls += ' full';
  if (value === 'half') cls += ' half';
  return cls;
}

function buildCalendar(start, end) {
  const cal = $('#calendar');
  cal.innerHTML = '';

  const days = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    if (state.weekdaysOnly && isWeekend(dt)) continue;
    const iso = formatDateISO(dt);
    days.push(iso);
  }

  const frag = document.createDocumentFragment();

  days.forEach(iso => {
    const d = parseISO(iso);
    const val = state.days.get(iso) || 'none';

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = dayClass(d, val);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${iso}`);
    if (iso === todayISO()) cell.setAttribute('aria-current', 'date');

    const dateEl = document.createElement('div');
    dateEl.className = 'date';
    dateEl.textContent = String(d.getDate());

    const labels = document.createElement('div');
    labels.className = 'labels sr-only';
    if (isHoliday(d)) labels.textContent = 'Feestdag';

    cell.append(dateEl, labels);

    // Click / keyboard
    cell.addEventListener('click', (e) => {
      const isShift = e.shiftKey;
      const cur = state.days.get(iso) || 'none';
      const next = isShift
        ? (cur === 'half' ? 'none' : 'half')
        : (cur === 'full' ? 'none' : 'full');
      state.days.set(iso, next);
      cell.className = dayClass(d, next);
      updateRemaining();
    });

    cell.addEventListener('keydown', (e) => {
      // Enter toggles, Shift+Enter half
      if (e.key === 'Enter') {
        e.preventDefault();
        const isShift = e.shiftKey;
        cell.click();
      }
    });

    frag.appendChild(cell);
  });

  cal.appendChild(frag);
}

function updateRemaining() {
  let used = 0;
  for (const [, v] of state.days) {
    if (v === 'full') used += 1;
    if (v === 'half') used += 0.5;
  }
  const remaining = Math.max(0, (state.quota || 0) - used);
  $('#remainingDays').textContent = remaining.toString();
}

function initForm() {
  const form = $('#settingsForm');
  const today = new Date();
  const endOfYear = new Date(today.getFullYear(), 11, 31);
  $('#today').textContent = today.toLocaleDateString('nl-BE');
  $('#endOfYear').textContent = endOfYear.toLocaleDateString('nl-BE');

  $('#startDate').value = formatDateISO(today);
  $('#endDate').value = formatDateISO(endOfYear);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.startDate = parseISO($('#startDate').value);
    state.endDate = parseISO($('#endDate').value);
    state.quota = parseFloat($('#quota').value || '0');
    state.weekdaysOnly = $('#weekdaysOnly').checked;
    state.excludeHolidays = $('#excludeHolidays').checked;

    buildCalendar(state.startDate, state.endDate);
    updateRemaining();
  });
}

/* Theme handling (auto / light / dark) */
function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const btn = $('#themeToggle');
  btn.setAttribute('aria-pressed', theme !== 'auto');
  btn.textContent = theme === 'auto' ? 'Modus: automatisch' : `Modus: ${theme}`;
}

function detectSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'auto';
  state.theme = saved;
  applyTheme(saved);

  $('#themeToggle').addEventListener('click', () => {
    const next = state.theme === 'auto'
      ? (detectSystemTheme() === 'dark' ? 'light' : 'dark')
      : (state.theme === 'light' ? 'dark' : 'auto');
    state.theme = next;
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initForm();
  initTheme();

  // Eerste build
  state.startDate = parseISO($('#startDate').value);
  state.endDate = parseISO($('#endDate').value);
  buildCalendar(state.startDate, state.endDate);
  updateRemaining();
});
