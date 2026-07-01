/* ═══════════════════════════════════════════════════════════════
   EnMed Calendar – Apple-Inspired Calendar Application
   ═══════════════════════════════════════════════════════════════ */

const TIMEZONE = 'America/Chicago';
const EVENTS_PATH = 'events.json';
const MCAL_OPTIONS = ['All', 'M0', 'M1', 'M2', 'M3', 'M4'];

const state = {
  events: [],
  filtered: [],
  view: 'month',
  anchorDate: getChicagoToday(),
  hasUrlDate: false,
  activeMCal: 'All',
  filters: {
    query: '',
    category: '',
    block: '',
    mand: '',
    group: '',
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindElements();
  bindEvents();
  syncStateFromUrl();
  setIcsUrl();
  renderMCalChips();
  renderViewButtons();

  try {
    const response = await fetch(EVENTS_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load ${EVENTS_PATH}: ${response.status}`);
    }

    const data = await response.json();
    state.events = normalizeEvents(Array.isArray(data) ? data : []);
    populateFilterOptions(state.events);
    applyFilters();
    ensureUsefulInitialDate();
    setLoadedAt();
  } catch (error) {
    renderError(error);
  }
}

function bindElements() {
  for (const id of [
    'icsUrl',
    'copyIcsUrl',
    'downloadFilteredIcs',
    'searchInput',
    'categoryFilter',
    'blockFilter',
    'mandFilter',
    'groupFilter',
    'resetFilters',
    'viewMonth',
    'viewWeek',
    'viewDay',
    'prevPeriod',
    'nextPeriod',
    'todayPeriod',
    'eventCount',
    'upcomingCount',
    'activeMCal',
    'calendarTitle',
    'lastUpdated',
    'resultSummary',
    'mCalChips',
    'calendarView',
    'eventModal',
    'closeModal',
    'modalBody',
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.copyIcsUrl.addEventListener('click', copyIcsUrl);
  els.downloadFilteredIcs.addEventListener('click', downloadFilteredIcs);
  els.resetFilters.addEventListener('click', resetFilters);

  els.searchInput.addEventListener('input', updateFiltersFromInputs);
  els.categoryFilter.addEventListener('change', updateFiltersFromInputs);
  els.blockFilter.addEventListener('change', updateFiltersFromInputs);
  els.mandFilter.addEventListener('change', updateFiltersFromInputs);
  els.groupFilter.addEventListener('change', updateFiltersFromInputs);

  els.viewMonth.addEventListener('click', () => setView('month'));
  els.viewWeek.addEventListener('click', () => setView('week'));
  els.viewDay.addEventListener('click', () => setView('day'));
  els.prevPeriod.addEventListener('click', () => shiftPeriod(-1));
  els.nextPeriod.addEventListener('click', () => shiftPeriod(1));
  els.todayPeriod.addEventListener('click', () => setAnchorDate(getChicagoToday()));

  // Modal close
  els.closeModal.addEventListener('click', closeEventModal);
  els.eventModal.addEventListener('click', (e) => {
    if (e.target === els.eventModal) closeEventModal();
  });

  // Keyboard: Escape closes modal, arrow keys navigate
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEventModal();
    if (e.key === 'ArrowLeft' && !isModalOpen()) shiftPeriod(-1);
    if (e.key === 'ArrowRight' && !isModalOpen()) shiftPeriod(1);
  });

  // Swipe navigation for touch
  setupSwipeNavigation();
}

/* ── SWIPE NAVIGATION ─────────────────────────────────────────── */
function setupSwipeNavigation() {
  let touchStartX = 0;
  let touchStartY = 0;
  let swiping = false;

  const board = document.querySelector('.cal-board');
  if (!board) return;

  board.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  board.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Only trigger on horizontal swipes with enough distance
    if (absDx > 60 && absDx > absDy * 1.5) {
      if (dx > 0) {
        shiftPeriod(-1);
      } else {
        shiftPeriod(1);
      }
    }
  }, { passive: true });
}

function isModalOpen() {
  return els.eventModal.classList.contains('is-open');
}

/* ── URL STATE ────────────────────────────────────────────────── */
function syncStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.hasUrlDate = params.has('date');
  state.view = ['month', 'week', 'day'].includes(params.get('view')) ? params.get('view') : 'month';
  state.anchorDate = parseDateInput(params.get('date')) || getChicagoToday();
  state.filters.query = params.get('q') || '';
  state.filters.category = params.get('category') || '';
  state.filters.block = params.get('block') || '';
  state.filters.mand = params.get('mand') || '';
  state.filters.group = params.get('group') || '';
  state.activeMCal = MCAL_OPTIONS.includes(params.get('mCal')) ? params.get('mCal') : 'All';
}

function syncUrlFromState() {
  const params = new URLSearchParams();
  if (state.view !== 'month') params.set('view', state.view);
  params.set('date', formatDateInput(state.anchorDate));
  if (state.filters.query) params.set('q', state.filters.query);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.block) params.set('block', state.filters.block);
  if (state.activeMCal && state.activeMCal !== 'All') params.set('mCal', state.activeMCal);
  if (state.filters.mand) params.set('mand', state.filters.mand);
  if (state.filters.group) params.set('group', state.filters.group);

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

/* ── ICS ──────────────────────────────────────────────────────── */
function setIcsUrl() {
  els.icsUrl.value = buildPublishedIcsUrl();
}

function buildPublishedIcsUrl() {
  const hostname = window.location.hostname || '';
  const isGithubPages = hostname.endsWith('.github.io');
  const owner = isGithubPages ? hostname.replace(/\.github\.io$/, '') : 'OWNER';
  const segments = window.location.pathname.split('/').filter(Boolean);
  const repo = segments[0] || 'REPO';
  
  let filename = 'calendar.ics';
  if (state.activeMCal && state.activeMCal !== 'All') {
    filename = `calendar-${state.activeMCal.toLowerCase()}.ics`;
  }
  
  return `https://${owner}.github.io/${repo}/${filename}`;
}

/* ── VIEW CONTROLS ────────────────────────────────────────────── */
function renderViewButtons() {
  const buttons = [
    [els.viewMonth, 'month'],
    [els.viewWeek, 'week'],
    [els.viewDay, 'day'],
  ];

  for (const [button, view] of buttons) {
    button.classList.toggle('is-active', state.view === view);
    button.setAttribute('aria-pressed', String(state.view === view));
  }
}

function setView(view) {
  state.view = view;
  renderViewButtons();
  applyFilters();
  syncUrlFromState();
}

function setAnchorDate(date) {
  state.anchorDate = { ...date };
  applyFilters();
  syncUrlFromState();
}

function shiftPeriod(direction) {
  if (state.view === 'month') {
    setAnchorDate(addMonths(state.anchorDate, direction));
    return;
  }

  const step = state.view === 'week' ? 7 : 1;
  setAnchorDate(addDays(state.anchorDate, direction * step));
}

/* ── FILTERS ──────────────────────────────────────────────────── */
function updateFiltersFromInputs() {
  state.filters.query = els.searchInput.value.trim();
  state.filters.category = els.categoryFilter.value;
  state.filters.block = els.blockFilter.value;
  state.filters.mand = els.mandFilter.value;
  state.filters.group = els.groupFilter.value;
  applyFilters();
  syncUrlFromState();
}

function syncInputsFromFilters() {
  els.searchInput.value = state.filters.query;
  els.categoryFilter.value = state.filters.category;
  els.blockFilter.value = state.filters.block;
  els.mandFilter.value = state.filters.mand;
  els.groupFilter.value = state.filters.group;
}

function resetFilters() {
  state.filters = { query: '', category: '', block: '', mand: '', group: '' };
  state.activeMCal = 'All';
  state.view = 'month';
  state.anchorDate = getChicagoToday();
  state.hasUrlDate = false;
  syncInputsFromFilters();
  renderMCalChips();
  renderViewButtons();
  applyFilters();
  syncUrlFromState();
}

function populateFilterOptions(events) {
  const fields = [
    ['category', els.categoryFilter],
    ['block', els.blockFilter],
    ['mand', els.mandFilter],
    ['group', els.groupFilter],
  ];

  for (const [field, select] of fields) {
    const values = [...new Set(events.map((event) => getFieldValue(event.raw[field]) || getMandatoryValue(event.raw[field])))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    select.innerHTML = [`<option value="">All</option>`, ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join('');
  }

  syncInputsFromFilters();
}

/* ── EVENTS NORMALIZATION ─────────────────────────────────────── */
function normalizeEvents(events) {
  return events
    .map((event, index) => normalizeEvent(event, index))
    .filter(Boolean)
    .sort(compareEvents);
}

function normalizeEvent(event, index) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const date = parseDateInput(event.date);
  const start = parseTime(event.start);
  if (!date || !start) {
    return null;
  }

  const end = event.end ? parseTime(event.end) : null;
  const normalizedEnd = end && compareTime(end, start) > 0 ? end : addMinutes(start, 60);
  const title = stringify(event.title) || 'Untitled event';
  const uidSource = event._id || `${title}-${event.date || index}-${event.start || 'start'}`;

  return {
    raw: event,
    index,
    title,
    date,
    start,
    end: normalizedEnd,
    startKey: makeDateTimeKey(date, start),
    endKey: makeDateTimeKey(date, normalizedEnd),
    uid: `${sanitizeUidPart(uidSource)}@enmed-pct-calendar`,
    searchText: buildSearchText(event),
  };
}

function compareEvents(a, b) {
  return a.startKey - b.startKey || a.endKey - b.endKey || a.index - b.index;
}

/* ── APPLY FILTERS ────────────────────────────────────────────── */
function applyFilters() {
  const nowKey = getChicagoNowKey();
  state.filtered = state.events.filter((event) => matchesFilters(event));
  state.filtered.sort((a, b) => {
    const aUpcoming = a.endKey >= nowKey ? 0 : 1;
    const bUpcoming = b.endKey >= nowKey ? 0 : 1;
    return aUpcoming - bUpcoming || a.startKey - b.startKey || a.index - b.index;
  });

  renderCalendar(nowKey);
  renderStats(nowKey);
  renderMCalChips();
  renderViewButtons();
  updateHeader();
  setIcsUrl();
}

function matchesFilters(event) {
  const filters = state.filters;
  if (state.activeMCal !== 'All' && getFieldValue(event.raw.mCal) !== state.activeMCal) {
    return false;
  }
  if (filters.query && !event.searchText.includes(filters.query.toLowerCase())) {
    return false;
  }
  if (filters.category && getFieldValue(event.raw.category) !== filters.category) {
    return false;
  }
  if (filters.block && getFieldValue(event.raw.block) !== filters.block) {
    return false;
  }
  if (filters.mand && getMandatoryValue(event.raw.mand) !== filters.mand) {
    return false;
  }
  if (filters.group && getFieldValue(event.raw.group) !== filters.group) {
    return false;
  }
  return true;
}

/* ── RENDER CALENDAR ──────────────────────────────────────────── */
function renderCalendar(nowKey) {
  els.calendarView.innerHTML = '';

  const range = getViewRange(state.view, state.anchorDate);
  const eventsInView = state.filtered.filter((event) => isDateInRange(event.date, range.start, range.end));

  if (!eventsInView.length && state.view !== 'month') {
    els.calendarView.appendChild(makeMessage('No matching events for this period. Try another date, filter, or calendar.'));
    els.resultSummary.textContent = '0 events';
    return;
  }

  if (state.view === 'month') {
    els.calendarView.appendChild(renderMonthGrid(eventsInView, nowKey));
  } else if (state.view === 'week') {
    els.calendarView.appendChild(renderWeekGrid(eventsInView, nowKey));
  } else {
    els.calendarView.appendChild(renderDayAgenda(eventsInView, nowKey));
  }

  els.resultSummary.textContent = `${eventsInView.length} event${eventsInView.length === 1 ? '' : 's'}`;
}

/* ── MONTH GRID ───────────────────────────────────────────────── */
function renderMonthGrid(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'month-grid';

  // Weekday headers
  const dayNames = window.innerWidth < 680
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (const dayName of dayNames) {
    const header = document.createElement('div');
    header.className = 'month-weekday';
    header.textContent = dayName;
    container.appendChild(header);
  }

  const monthStart = startOfMonth(state.anchorDate);
  const gridStart = startOfWeek(monthStart);
  const eventsByDay = groupEventsByDate(events);
  const isMobile = window.innerWidth < 680;
  const maxVisible = isMobile ? 2 : 3;

  for (let offset = 0; offset < 42; offset += 1) {
    const day = addDays(gridStart, offset);
    const dayKey = formatDateInput(day);
    const dayEvents = (eventsByDay.get(dayKey) || []).sort(compareEvents);
    const cell = document.createElement('div');
    cell.className = 'month-day-cell';
    if (isSameDate(day, getChicagoToday())) cell.classList.add('is-today');
    if (isSameDate(day, state.anchorDate)) cell.classList.add('is-selected');
    if (!isSameMonth(day, monthStart)) cell.classList.add('is-outside-month');

    cell.addEventListener('click', () => {
      setAnchorDate(day);
      setView('day');
    });

    // Day number header
    const dayHeader = document.createElement('div');
    dayHeader.className = 'month-day-header';
    const dayNumber = document.createElement('span');
    dayNumber.className = 'month-day-number';
    dayNumber.textContent = String(day.day);
    dayHeader.appendChild(dayNumber);
    cell.appendChild(dayHeader);

    // Event chips
    const eventList = document.createElement('div');
    eventList.className = 'month-day-events';

    for (const event of dayEvents.slice(0, maxVisible)) {
      eventList.appendChild(buildMonthEventChip(event, nowKey));
    }

    if (dayEvents.length > maxVisible) {
      const more = document.createElement('div');
      more.className = 'month-day-more';
      more.textContent = `+${dayEvents.length - maxVisible}`;
      eventList.appendChild(more);
    }

    cell.appendChild(eventList);
    container.appendChild(cell);
  }

  return container;
}

function buildMonthEventChip(event, nowKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'month-event-chip';
  button.dataset.mcal = getFieldValue(event.raw.mCal);

  if (event.endKey < nowKey) {
    button.classList.add('is-past');
  }

  const title = document.createElement('span');
  title.className = 'month-event-title';
  title.textContent = event.title;

  const time = document.createElement('span');
  time.className = 'month-event-time';
  time.textContent = formatShortTime(event.start);

  button.append(time, title);
  button.title = buildEventTooltip(event);
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openEventModal(event);
  });
  return button;
}

/* ── WEEK GRID ────────────────────────────────────────────────── */
function renderWeekGrid(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'week-grid';

  const start = startOfWeek(state.anchorDate);
  const eventsByDay = groupEventsByDate(events);

  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(start, offset);
    const dayKey = formatDateInput(day);
    const dayEvents = (eventsByDay.get(dayKey) || []).sort(compareEvents);
    const column = document.createElement('section');
    column.className = 'week-column';
    if (isSameDate(day, getChicagoToday())) column.classList.add('is-today');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'week-column-header';
    header.innerHTML = `<span>${weekdayLong(day)}</span><strong>${day.month}/${day.day}</strong>`;
    header.addEventListener('click', () => {
      setAnchorDate(day);
      setView('day');
    });

    const items = document.createElement('div');
    items.className = 'week-column-events';

    for (const event of dayEvents) {
      items.appendChild(buildAgendaCard(event, nowKey, 'compact'));
    }

    if (!dayEvents.length) {
      const empty = document.createElement('div');
      empty.className = 'week-column-empty';
      empty.textContent = 'No events';
      items.appendChild(empty);
    }

    column.append(header, items);
    container.appendChild(column);
  }

  return container;
}

/* ── DAY VIEW ─────────────────────────────────────────────────── */
function renderDayAgenda(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'day-agenda';

  const header = document.createElement('div');
  header.className = 'day-agenda-header';
  header.innerHTML = `<div><p class="eyebrow">${weekdayFull(state.anchorDate)}</p><h3>${formatLongDate(state.anchorDate)}</h3></div>`;
  container.appendChild(header);

  const items = document.createElement('div');
  items.className = 'day-agenda-items';

  if (!events.length) {
    items.appendChild(makeMessage('No events scheduled for this day.'));
  } else {
    for (const event of events.sort(compareEvents)) {
      items.appendChild(buildAgendaCard(event, nowKey, 'full'));
    }
  }

  container.appendChild(items);
  return container;
}

/* ── AGENDA CARD ──────────────────────────────────────────────── */
function buildAgendaCard(event, nowKey, mode) {
  const article = document.createElement('article');
  article.className = `agenda-card agenda-card--${mode}`;
  if (event.endKey < nowKey) {
    article.classList.add('is-past');
  }

  // Make cards clickable to open modal
  article.addEventListener('click', () => openEventModal(event));

  const topline = document.createElement('div');
  topline.className = 'agenda-card-topline';

  const heading = document.createElement('div');
  const time = document.createElement('p');
  time.className = 'agenda-card-time';
  time.textContent = formatTimeRange(event.date, event.start, event.end);

  const title = document.createElement('h4');
  title.className = 'agenda-card-title';
  title.textContent = event.title;

  heading.append(time, title);

  const badge = document.createElement('span');
  badge.className = 'agenda-card-badge';
  badge.dataset.mcal = getFieldValue(event.raw.mCal);
  badge.textContent = getFieldValue(event.raw.mCal) || '—';

  topline.append(heading, badge);
  article.appendChild(topline);

  // In compact mode, skip details
  if (mode === 'compact') return article;

  const meta = document.createElement('p');
  meta.className = 'agenda-card-meta';
  const metaText = [stringify(event.raw.location), stringify(event.raw.presenter)].filter(Boolean).join(' · ');
  if (metaText) {
    meta.textContent = metaText;
    article.appendChild(meta);
  }

  const desc = document.createElement('p');
  desc.className = 'agenda-card-desc';
  const descText = [stringify(event.raw.desc), stringify(event.raw.info)].filter(Boolean).join(' · ');
  if (descText) {
    desc.textContent = descText;
    article.appendChild(desc);
  }

  const fields = document.createElement('dl');
  fields.className = 'agenda-card-fields';
  let hasFields = false;
  for (const [label, value] of [
    ['Category', event.raw.category],
    ['Block', event.raw.block],
    ['Mandatory', event.raw.mand],
    ['Group', event.raw.group],
  ]) {
    const text = stringify(value);
    if (!text) continue;
    hasFields = true;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = text;
    fields.append(dt, dd);
  }
  if (hasFields) article.appendChild(fields);

  return article;
}

/* ── EVENT MODAL ──────────────────────────────────────────────── */
function openEventModal(event) {
  const body = els.modalBody;
  const mCalValue = getFieldValue(event.raw.mCal);

  body.innerHTML = '';

  // Badge
  const badge = document.createElement('div');
  badge.className = 'modal-event-badge';
  badge.textContent = mCalValue || 'No Calendar';
  badge.dataset.mcal = mCalValue;
  // Apply same color as agenda badge
  const badgeColors = {
    'M0': { bg: 'rgba(0,122,255,0.1)', color: '#0055b3' },
    'M1': { bg: 'rgba(52,199,89,0.1)', color: '#1a8a3e' },
    'M2': { bg: 'rgba(255,149,0,0.1)', color: '#b37400' },
    'M3': { bg: 'rgba(175,82,222,0.1)', color: '#7b3a9e' },
    'M4': { bg: 'rgba(255,59,48,0.1)', color: '#cc1a11' },
    'Program-Wide': { bg: 'rgba(80,0,0,0.06)', color: '#500000' },
  };
  const bc = badgeColors[mCalValue] || { bg: 'rgba(0,0,0,0.05)', color: '#86868b' };
  badge.style.background = bc.bg;
  badge.style.color = bc.color;
  body.appendChild(badge);

  // Title
  const title = document.createElement('h2');
  title.className = 'modal-event-title';
  title.textContent = event.title;
  body.appendChild(title);

  // Time
  const time = document.createElement('p');
  time.className = 'modal-event-time';
  time.textContent = `${formatLongDate(event.date)} · ${formatTimeRange(event.date, event.start, event.end)}`;
  body.appendChild(time);

  // Details grid
  const details = document.createElement('div');
  details.className = 'modal-event-detail';

  const fields = [
    ['Location', event.raw.location],
    ['Presenter', event.raw.presenter],
    ['Category', event.raw.category],
    ['Block', event.raw.block],
    ['Mandatory', event.raw.mand],
    ['Group', event.raw.group],
    ['Week', event.raw.week],
    ['Description', event.raw.desc],
    ['Info', event.raw.info],
  ];

  for (const [label, value] of fields) {
    const text = stringify(value);
    if (!text) continue;
    const row = document.createElement('div');
    row.className = 'modal-detail-row';
    row.innerHTML = `<span class="modal-detail-label">${escapeHtml(label)}</span><span class="modal-detail-value">${escapeHtml(text)}</span>`;
    details.appendChild(row);
  }

  body.appendChild(details);
  els.eventModal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeEventModal() {
  els.eventModal.classList.remove('is-open');
  document.body.style.overflow = '';
}

/* ── STATS ────────────────────────────────────────────────────── */
function renderStats(nowKey) {
  const upcoming = state.filtered.filter((event) => event.endKey >= nowKey).length;
  els.eventCount.textContent = String(state.events.length);
  els.upcomingCount.textContent = String(upcoming);
  els.activeMCal.textContent = state.activeMCal;
}

/* ── MCAL CHIPS ───────────────────────────────────────────────── */
function renderMCalChips() {
  els.mCalChips.innerHTML = MCAL_OPTIONS.map((value) => {
    const active = value === state.activeMCal ? ' is-active' : '';
    return `<button type="button" class="mcal-chip${active}" data-mcal="${escapeHtml(value)}" aria-pressed="${value === state.activeMCal}">${escapeHtml(value === 'All' ? 'All Calendars' : value)}</button>`;
  }).join('');

  els.mCalChips.querySelectorAll('button[data-mcal]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeMCal = button.dataset.mcal || 'All';
      applyFilters();
      syncUrlFromState();
    });
  });
}

/* ── HEADER ───────────────────────────────────────────────────── */
function updateHeader() {
  els.calendarTitle.textContent = getViewTitle(state.view, state.anchorDate);
}

function getViewTitle(view, date) {
  if (view === 'month') {
    return `${monthNameFull(date.month)} ${date.year}`;
  }

  if (view === 'week') {
    const range = getViewRange('week', date);
    if (range.start.month === range.end.month) {
      return `${monthNameFull(range.start.month)} ${range.start.day}–${range.end.day}, ${range.start.year}`;
    }
    return `${monthName(range.start.month)} ${range.start.day} – ${monthName(range.end.month)} ${range.end.day}`;
  }

  return `${weekdayFull(date)}, ${monthNameFull(date.month)} ${date.day}`;
}

/* ── CLIPBOARD ────────────────────────────────────────────────── */
function copyIcsUrl() {
  const text = els.icsUrl.value;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => indicateCopySuccess()).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  els.icsUrl.focus();
  els.icsUrl.select();
  document.execCommand('copy');
  indicateCopySuccess();
}

function indicateCopySuccess() {
  const button = els.copyIcsUrl;
  const original = button.textContent;
  button.textContent = 'Copied!';
  button.style.background = 'var(--teal-soft)';
  button.style.color = 'var(--teal)';
  window.setTimeout(() => {
    button.textContent = original;
    button.style.background = '';
    button.style.color = '';
  }, 1500);
}

/* ── ICS DOWNLOAD ─────────────────────────────────────────────── */
function downloadFilteredIcs() {
  let calName = 'EnMed Calendar';
  let filename = 'calendar.ics';

  if (state.activeMCal && state.activeMCal !== 'All') {
    calName = `EnMed ${state.activeMCal} Calendar`;
    filename = `enmed-${state.activeMCal.toLowerCase()}-calendar.ics`;
  }

  const blob = new Blob([buildIcs(state.filtered, calName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.filtered.length ? filename.replace('.ics', '.filtered.ics') : filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildIcs(events, calName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//GitHub Pages Calendar Mirror//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
    ...timezoneComponent(),
  ];

  for (const event of [...events].sort(compareEvents)) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(event.uid)}`);
    lines.push(`DTSTAMP:${formatUtcStamp(new Date())}`);
    lines.push(`DTSTART;TZID=${TIMEZONE}:${buildIcsDateTime(event.date, event.start)}`);
    lines.push(`DTEND;TZID=${TIMEZONE}:${buildIcsDateTime(event.date, event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

    const description = buildDescription(event.raw);
    if (description) {
      lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    }

    const location = stringify(event.raw.location);
    if (location) {
      lines.push(`LOCATION:${escapeIcsText(location)}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return foldIcsLines(lines);
}

function timezoneComponent() {
  return [
    'BEGIN:VTIMEZONE',
    'TZID:America/Chicago',
    'X-LIC-LOCATION:America/Chicago',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:20070311T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:20071104T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function getViewRange(view, date) {
  if (view === 'month') {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  if (view === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 6) };
  }
  return { start: date, end: date };
}

function groupEventsByDate(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = formatDateInput(event.date);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(event);
  }
  return grouped;
}

function buildEventTooltip(event) {
  return [event.title, formatTimeRange(event.date, event.start, event.end), stringify(event.raw.location)].filter(Boolean).join(' · ');
}

function setLoadedAt() {
  els.lastUpdated.textContent = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function renderError(error) {
  console.error(error);
  els.calendarView.innerHTML = '';
  const message = makeMessage('Unable to load events. Check the source feed or try again later.');
  message.classList.add('error-state');
  els.calendarView.appendChild(message);
  els.resultSummary.textContent = 'Feed unavailable';
}

function makeMessage(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

function ensureUsefulInitialDate() {
  if (state.hasUrlDate || !state.filtered.length) {
    return;
  }

  const range = getViewRange(state.view, state.anchorDate);
  const hasEventsInView = state.filtered.some((event) => isDateInRange(event.date, range.start, range.end));
  if (hasEventsInView) {
    return;
  }

  state.anchorDate = { ...state.filtered[0].date };
  applyFilters();
  syncUrlFromState();
}

function buildSearchText(event) {
  return [event.title, event.desc, event.info, event.presenter, event.location]
    .map((value) => stringify(value).toLowerCase())
    .join(' ');
}

/* ── DATE / TIME UTILITIES ────────────────────────────────────── */
function parseDateInput(value) {
  if (!value) return null;

  const trimmed = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDate(year, month, day) ? { year, month, day } : null;
  }

  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!mmddyyyy) return null;

  const month = Number(mmddyyyy[1]);
  const day = Number(mmddyyyy[2]);
  const year = Number(mmddyyyy[3]);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(stringify(value));
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return { hour, minute };
}

function addMinutes(time, minutes) {
  const totalMinutes = time.hour * 60 + time.minute + minutes;
  return {
    hour: Math.floor((totalMinutes % (24 * 60)) / 60),
    minute: totalMinutes % 60,
  };
}

function compareTime(a, b) {
  return a.hour * 60 + a.minute - (b.hour * 60 + b.minute);
}

function makeDateTimeKey(date, time) {
  return Number(`${date.year}${pad(date.month)}${pad(date.day)}${pad(time.hour)}${pad(time.minute)}`);
}

function getChicagoToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function getChicagoNowKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(`${map.year}${map.month}${map.day}${map.hour}${map.minute}`);
}

function startOfMonth(date) {
  return { year: date.year, month: date.month, day: 1 };
}

function endOfMonth(date) {
  const month = new Date(Date.UTC(date.year, date.month, 0));
  return { year: month.getUTCFullYear(), month: month.getUTCMonth() + 1, day: month.getUTCDate() };
}

function startOfWeek(date) {
  const current = toUtcDate(date);
  return fromUtcDate(addDateParts(current, -current.getUTCDay()));
}

function addDays(date, amount) {
  return fromUtcDate(addDateParts(toUtcDate(date), amount));
}

function addMonths(date, amount) {
  const current = toUtcDate(date);
  const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + amount, current.getUTCDate()));
  return fromUtcDate(next);
}

function addDateParts(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function toUtcDate(date) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function fromUtcDate(date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function formatLongDate(date) {
  return `${monthNameFull(date.month)} ${date.day}, ${date.year}`;
}

function formatDateInput(date) {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function formatShortTime(time) {
  const fakeDate = new Date(Date.UTC(2000, 0, 1, time.hour, time.minute));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(fakeDate);
}

function timezoneAbbrev(date, time) {
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'short',
  })
    .formatToParts(utcDate)
    .find((part) => part.type === 'timeZoneName')?.value || 'CT';
}

function formatTimeRange(date, start, end) {
  return `${formatShortTime(start)} – ${formatShortTime(end)} ${timezoneAbbrev(date, start)}`;
}

function monthName(month) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || '';
}

function monthNameFull(month) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1] || '';
}

function weekdayLong(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(toUtcDate(date));
}

function weekdayFull(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(toUtcDate(date));
}

function isSameDate(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function isSameMonth(date, monthStart) {
  return date.year === monthStart.year && date.month === monthStart.month;
}

function isDateInRange(date, start, end) {
  const value = dateToNumber(date);
  return value >= dateToNumber(start) && value <= dateToNumber(end);
}

function dateToNumber(date) {
  return Number(`${date.year}${pad(date.month)}${pad(date.day)}`);
}

function buildIcsDateTime(date, time) {
  return `${date.year}${pad(date.month)}${pad(date.day)}T${pad(time.hour)}${pad(time.minute)}00`;
}

function formatUtcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function foldIcsLines(lines) {
  return lines.map((line) => foldIcsLine(line)).join('\r\n') + '\r\n';
}

function foldIcsLine(line) {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  chunks.push(remaining);
  return chunks.join('\r\n');
}

function escapeIcsText(value) {
  return stringify(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function sanitizeUidPart(value) {
  return stringify(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'event';
}

function getFieldValue(value) {
  return stringify(value);
}

function getMandatoryValue(value) {
  const normalized = stringify(value).toLowerCase();
  if (!normalized) return '';
  if (['yes', 'y', 'true', '1'].includes(normalized)) return 'Yes';
  if (['no', 'n', 'false', '0'].includes(normalized)) return 'No';
  return stringify(value);
}

function stringify(value) {
  return value == null ? '' : String(value).trim();
}

function escapeHtml(value) {
  return stringify(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function buildDescription(event) {
  return [
    ['desc', event.desc],
    ['info', event.info],
    ['presenter', event.presenter],
    ['category', event.category],
    ['block', event.block],
    ['week', event.week],
    ['calYear', event.calYear],
    ['mCal', event.mCal],
    ['mand', event.mand],
    ['group', event.group],
  ]
    .filter(([, value]) => stringify(value))
    .map(([label, value]) => `${label}: ${stringify(value)}`)
    .join('\n');
}
