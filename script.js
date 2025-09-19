(function () {
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));

  const state = {
    theme: null,
    startDate: null,
    endDate: null,
    quota: 0,
    selection: new Map(), // key: ISO date, value: 'full' | 'half'
  };

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initDefaultDates();      // <-- nieuw: vandaag en 31 dec dit jaar
    bindControls();
    renderCalendar(state.startDate, state.endDate);
    updateSummary();
    announce('Kalender geladen met standaardbereik.');
  });

  function initDefaultDates() {
    const today = new Date();
    const end = new Date(today.getFullYear(), 11, 31); // 11 = december
    // Normaliseer naar lokale dag zonder tijdcomponent
    const startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    // Sla op in state
    state.startDate = startLocal;
    state.endDate = endLocal;

    // Zet in inputs indien aanwezig
    const startInput = qs('#start-date');
    const endInput = qs('#end-date');
    if (startInput) startInput.valueAsDate = startLocal;
    if (endInput)   endInput.valueAsDate = endLocal;
  }

  function initTheme() {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
        state.theme = saved;
      }
    } catch {}
    const btn = qs('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = (state.theme === 'dark') ? 'light' : 'dark';
        state.theme = next;
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch {}
        btn.setAttribute('aria-pressed', String(next === 'dark'));
      });
      btn.setAttribute('aria-pressed', String(state.theme === 'dark'));
    }
  }

  function bindControls() {
    const form = qs('#planner-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      // Lees actuele waarden, maar forceer altijd einddatum = 31 dec huidig jaar
      const s = qs('#start-date')?.valueAsDate || state.startDate;
      const year = (s instanceof Date) ? s.getFullYear() : new Date().getFullYear();
      const enforcedEnd = new Date(year, 11, 31);
      state.startDate = normalizeDate(s || new Date());
      state.endDate = normalizeDate(enforcedEnd);

      // Schrijf terug naar inputs om consistent te blijven met de regel
      const endInput = qs('#end-date');
      if (endInput) endInput.valueAsDate = state.endDate;

      const q = Number(qs('#quota')?.value || 0);
      state.quota = Number.isFinite(q) ? q : 0;

      renderCalendar(state.startDate, state.endDate);
      updateSummary();
      announce('Instellingen toegepast: nieuw bereik ingesteld.');
    });

    // Extra: als iemand handmatig de einddatum verandert, zet hem terug naar 31/12
    qs('#end-date')?.addEventListener('change', () => {
      const s = qs('#start-date')?.valueAsDate || state.startDate || new Date();
      const year = (s instanceof Date) ? s.getFullYear() : new Date().getFullYear();
      const enforcedEnd = new Date(year, 11, 31);
      state.endDate = normalizeDate(enforcedEnd);
      const endInput = qs('#end-date');
      if (endInput) endInput.valueAsDate = state.endDate;
      renderCalendar(state.startDate, state.endDate);
      updateSummary();
      announce('Einddatum vastgezet op 31 december.');
    });

    qs('#reset')?.addEventListener('click', () => {
      state.selection.clear();
      qsa('.day').forEach(clearDayState);
      updateSummary();
      announce('Selectie hersteld.');
    });
  }

  function normalizeDate(d) {
    if (!(d instanceof Date)) return new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function renderCalendar(start, end) {
    const container = qs('#calendar');
    if (!container) return;
    container.innerHTML = '';

    if (!(start instanceof Date) || !(end instanceof Date)) return;

    // Maak een nieuwe Date-klok die niet het origineel muteert
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    const days = [];
    while (cursor <= end) {
      const dow = cursor.getDay(); // 0=zo..6=za
      if (dow !== 0 && dow !== 6) {
        const iso = toISO(cursor);

        const isHoliday = false; // TODO: echte controle op Belgische feestdagen
        const isFl = false;      // TODO: Vlaamse schoolvakanties
        const isWa = false;      // TODO: Waalse/FBW schoolvakanties

        days.push({ date: new Date(cursor), iso, isHoliday, isFl, isWa });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Maak cellen
    days.forEach(({ date, iso, isHoliday, isFl, isWa }, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day';
      btn.setAttribute('role', 'gridcell');
      btn.tabIndex = idx === 0 ? 0 : -1;
      btn.dataset.date = iso;
      btn.setAttribute('aria-label', formatAriaLabel(date, { isHoliday, isFl, isWa }));

      if (isHoliday) btn.classList.add('day--holiday');
      else btn.classList.add('day--workday');
      if (isFl) btn.classList.add('day--fl');
      if (isWa) btn.classList.add('day--wa');
      if (isFl && isWa) btn.classList.add('day--overlap');

      btn.textContent = String(date.getDate());

      btn.addEventListener('click', (ev) => {
        if (ev.shiftKey) toggleDay(iso, 'half', btn);
        else toggleDay(iso, 'full', btn);
      });

      btn.addEventListener('keydown', (ev) => {
        const key = ev.key;
        if (key === ' ' || key === 'Enter') {
          ev.preventDefault();
          toggleDay(iso, ev.shiftKey ? 'half' : 'full', btn);
        } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key)) {
          ev.preventDefault();
          moveFocus(btn, key, container);
        }
      });

      container.appendChild(btn);
    });

    updateSummary();
  }

  function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  function toggleDay(iso, kind, el) {
    const prev = state.selection.get(iso) || null;
    let next = null;
    if (prev === kind) next = null;
    else next = kind;

    state.selection.set(iso, next);
    applyDayState(el, next);
    updateSummary();
    announce((next ? (next === 'half' ? 'Halve dag' : 'Volledige dag') : 'Geen selectie') + ' ingesteld op ' + iso + '.');
  }

  function applyDayState(el, kind) {
    clearDayState(el);
    if (kind === 'full') el.classList.add('day--full');
    else if (kind === 'half') el.classList.add('day--half');
    el.setAttribute('aria-selected', kind ? 'true' : 'false');
    el.setAttribute('aria-pressed', kind ? 'true' : 'false');
  }

  function clearDayState(el) {
    el.classList.remove('day--full', 'day--half');
    el.removeAttribute('aria-selected');
    el.removeAttribute('aria-pressed');
  }

  function moveFocus(current, key, container) {
    const cells = qsa('.day', container);
    const idx = cells.indexOf(current);
    const cols = 7; // raster voor een kalenderweek
    let nextIdx = idx;

    switch (key) {
      case 'ArrowLeft':  nextIdx = Math.max(0, idx - 1); break;
      case 'ArrowRight': nextIdx = Math.min(cells.length - 1, idx + 1); break;
      case 'ArrowUp':    nextIdx = Math.max(0, idx - cols); break;
      case 'ArrowDown':  nextIdx = Math.min(cells.length - 1, idx + cols); break;
      case 'Home':       nextIdx = Math.floor(idx / cols) * cols; break;
      case 'End':        nextIdx = Math.min(cells.length - 1, Math.floor(idx / cols) * cols + (cols - 1)); break;
      case 'PageUp':     nextIdx = Math.max(0, idx - cols * 4); break;
      case 'PageDown':   nextIdx = Math.min(cells.length - 1, idx + cols * 4); break;
    }

    if (nextIdx !== idx) {
      current.tabIndex = -1;
      const next = cells[nextIdx];
      if (next) {
        next.tabIndex = 0;
        next.focus();
      }
    }
  }

  function updateSummary() {
    const el = qs('.summary');
    if (!el) return;
    const full = [...state.selection.values()].filter(v => v === 'full').length;
    const half = [...state.selection.values()].filter(v => v === 'half').length;
    const totaal = full + (half * 0.5);
    el.textContent = `Geselecteerd: ${full} volledige dag(en), ${half} halve dag(en) — totaal ${totaal} dag(en).`;
  }

  function announce(msg) {
    const el = qs('.summary');
    if (el) {
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.setAttribute('data-status', msg);
    }
  }

  function formatAriaLabel(date, flags) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const base = `${day}-${month}-${date.getFullYear()}`;
    const tags = [];
    if (flags.isHoliday) tags.push('feestdag');
    if (flags.isFl && flags.isWa) tags.push('overlap schoolvakantie');
    else if (flags.isFl) tags.push('Vlaamse schoolvakantie');
    else if (flags.isWa) tags.push('Waalse schoolvakantie');
    return tags.length ? `${base} (${tags.join(', ')})` : base;
  }
})();
