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
    bindControls();
    // TODO: Stel start/einddatum in (vandaag → einde jaar), en render vervolgens de kalender.
    const today = new Date();
    const end = new Date(today.getFullYear(), 11, 31);
    qs('#start-date').valueAsDate = today;
    qs('#end-date').valueAsDate = end;

    renderCalendar(today, end);
    announce('Kalender geladen.');
  });

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
      const s = qs('#start-date')?.valueAsDate;
      const eDate = qs('#end-date')?.valueAsDate;
      const q = Number(qs('#quota')?.value || 0);
      state.startDate = s;
      state.endDate = eDate;
      state.quota = Number.isFinite(q) ? q : 0;
      renderCalendar(s, eDate);
      updateSummary();
      announce('Instellingen toegepast.');
    });

    qs('#reset')?.addEventListener('click', () => {
      state.selection.clear();
      qsa('.day').forEach(clearDayState);
      updateSummary();
      announce('Selectie hersteld.');
    });
  }

  function renderCalendar(start, end) {
    const container = qs('#calendar');
    container.innerHTML = '';
    if (!(start instanceof Date) || !(end instanceof Date)) return;

    // Bouw lijst van dagen (ma–vr), excl. Belgische feestdagen en markeer schoolvakanties (placeholder)
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=zo..6=za
      if (dow === 0 || dow === 6) continue; // ma–vr
      const iso = d.toISOString().slice(0, 10);

      const isHoliday = false; // TODO: vervang met echte controle op Belgische feestdagen
      const isFl = false;      // TODO: vervang met controle Vlaamse schoolvakanties
      const isWa = false;      // TODO: vervang met controle Waalse/FBW schoolvakanties

      days.push({ date: new Date(d), iso, isHoliday, isFl, isWa });
    }

    days.forEach(({ date, iso, isHoliday, isFl, isWa }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day';
      btn.role = 'gridcell';
      btn.tabIndex = -1;
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

    // Maak eerste focusbaar
    const first = container.querySelector('.day');
    if (first) first.tabIndex = 0;

    updateSummary();
  }

  function toggleDay(iso, kind, el) {
    const prev = state.selection.get(iso) || null;
    let next = null;
    if (prev === kind) next = null;        // dezelfde nogmaals = uit
    else next = kind;                      // anders vervangen

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
    const cols = 7; // weekkolommen (ma–vr + weekend verborgen, maar pijlnavigatie blijft 7 breed)
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
    const full = [...state.selection.values()].filter(v => v === 'full').length;
    const half = [...state.selection.values()].filter(v => v === 'half').length;
    const totaal = full + (half * 0.5);
    el.textContent = `Geselecteerd: ${full} volledige dag(en), ${half} halve dag(en) — totaal ${totaal} dag(en).`;
  }

  function announce(msg) {
    const el = qs('.summary');
    if (el) el.setAttribute('aria-label', msg);
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

  // VERVANGERS:
  // - Voeg feestdagen-/vakantiedata toe en markeer in renderCalendar.
  // - Behoud bestaande id/class-namen uit jouw HTML voor minimale breuk.
})();
