const TIMEZONE = 'America/Chicago';
const EVENTS_PATH = 'events.json';
const MCAL_OPTIONS = ['All', 'M0', 'M1', 'M2', 'M3', 'M4'];

const state = {
  events: [],
  filtered: [],
  view: 'month',
  anchorDate: getChicagoToday(),
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
}

function syncStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.view = ['month', 'week', 'day'].includes(params.get('view')) ? params.get('view') : 'month';
  state.anchorDate = parseDateInput(params.get('date')) || getChicagoToday();
  state.filters.query = params.get('q') || '';
  state.filters.category = params.get('category') || '';
  state.filters.block = params.get('block') || '';
  state.filters.mand = params.get('mand') || '';
  state.filters.group = params.get('group') || '';
  state.activeMCal = MCAL_OPTIONS.includes(params.get('mCal')) ? params.get('mCal') : 'All';
}

function setIcsUrl() {
  els.icsUrl.value = buildPublishedIcsUrl();
}

function buildPublishedIcsUrl() {
  const hostname = window.location.hostname || '';
  const isGithubPages = hostname.endsWith('.github.io');
  const owner = isGithubPages ? hostname.replace(/\.github\.io$/, '') : 'OWNER';
  const segments = window.location.pathname.split('/').filter(Boolean);
  const repo = segments[0] || 'REPO';
  return `https://${owner}.github.io/${repo}/calendar.ics`;
}

function renderViewButtons() {
  const buttons = [
    [els.viewMonth, 'month', 'Month'],
    [els.viewWeek, 'week', 'Week'],
    [els.viewDay, 'day', 'Day'],
  ];

  for (const [button, view, label] of buttons) {
    button.classList.toggle('is-active', state.view === view);
    button.setAttribute('aria-pressed', String(state.view === view));
    button.textContent = label;
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

function resetFilters() {
  state.filters = { query: '', category: '', block: '', mand: '', group: '' };
  state.activeMCal = 'All';
  state.view = 'month';
  state.anchorDate = getChicagoToday();
  syncInputsFromFilters();
  renderMCalChips();
  renderViewButtons();
  applyFilters();
  syncUrlFromState();
}

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

function renderCalendar(nowKey) {
  els.calendarView.innerHTML = '';

  const range = getViewRange(state.view, state.anchorDate);
  const eventsInView = state.filtered.filter((event) => isDateInRange(event.date, range.start, range.end));

  if (!eventsInView.length) {
    els.calendarView.appendChild(makeMessage('No matching events found for this view. Try another mCal chip, change the date, or clear one of the filters.'));
    els.resultSummary.textContent = '0 events matched';
    return;
  }

  if (state.view === 'month') {
    els.calendarView.appendChild(renderMonthGrid(eventsInView, nowKey));
  } else if (state.view === 'week') {
    els.calendarView.appendChild(renderWeekGrid(eventsInView, nowKey));
  } else {
    els.calendarView.appendChild(renderDayAgenda(eventsInView, nowKey));
  }

  els.resultSummary.textContent = `${eventsInView.length} event${eventsInView.length === 1 ? '' : 's'} in view`;
}

function renderMonthGrid(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'calendar-grid month-grid';

  for (const dayName of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const header = document.createElement('div');
    header.className = 'month-weekday';
    header.textContent = dayName;
    container.appendChild(header);
  }

  const monthStart = startOfMonth(state.anchorDate);
  const gridStart = startOfWeek(monthStart);
  const eventsByDay = groupEventsByDate(events);

  for (let offset = 0; offset < 42; offset += 1) {
    const day = addDays(gridStart, offset);
    const dayKey = formatDateInput(day);
    const dayEvents = (eventsByDay.get(dayKey) || []).sort(compareEvents);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'month-day-cell';
    if (isSameDate(day, getChicagoToday())) cell.classList.add('is-today');
    if (isSameDate(day, state.anchorDate)) cell.classList.add('is-selected');
    if (!isSameMonth(day, monthStart)) cell.classList.add('is-outside-month');
    cell.addEventListener('click', () => setAnchorDate(day));

    const dayHeader = document.createElement('div');
    dayHeader.className = 'month-day-header';
    const dayNumber = document.createElement('span');
    dayNumber.className = 'month-day-number';
    dayNumber.textContent = String(day.day);
    dayHeader.appendChild(dayNumber);

    if (isSameDate(day, getChicagoToday())) {
      const todayChip = document.createElement('span');
      todayChip.className = 'month-day-chip';
      todayChip.textContent = 'Today';
      dayHeader.appendChild(todayChip);
    }

    cell.appendChild(dayHeader);

    const eventList = document.createElement('div');
    eventList.className = 'month-day-events';

    for (const event of dayEvents.slice(0, 3)) {
      eventList.appendChild(buildMonthEventChip(event, nowKey));
    }

    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'month-day-more';
      more.textContent = `+${dayEvents.length - 3} more`;
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
  if (event.endKey < nowKey) {
    button.classList.add('is-past');
  }

  const time = document.createElement('span');
  time.className = 'month-event-time';
  time.textContent = formatShortTime(event.start);

  const title = document.createElement('span');
  title.className = 'month-event-title';
  title.textContent = event.title;

  button.append(time, title);
  button.title = buildEventTooltip(event);
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setAnchorDate(event.date);
    setView('day');
  });
  return button;
}

function renderWeekGrid(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'calendar-grid week-grid';

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
    header.addEventListener('click', () => setAnchorDate(day));

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

function renderDayAgenda(events, nowKey) {
  const container = document.createElement('div');
  container.className = 'day-agenda';

  const header = document.createElement('div');
  header.className = 'day-agenda-header';
  header.innerHTML = `<div><p class="eyebrow">Day</p><h3>${formatLongDate(state.anchorDate)}</h3></div>`;
  container.appendChild(header);

  const items = document.createElement('div');
  items.className = 'day-agenda-items';

  for (const event of events.sort(compareEvents)) {
    items.appendChild(buildAgendaCard(event, nowKey, 'full'));
  }

  container.appendChild(items);
  return container;
}

function buildAgendaCard(event, nowKey, mode) {
  const article = document.createElement('article');
  article.className = `agenda-card agenda-card--${mode}`;
  if (event.endKey < nowKey) {
    article.classList.add('is-past');
  }

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
  badge.textContent = getFieldValue(event.raw.mCal) || 'No mCal';

  topline.append(heading, badge);
  article.appendChild(topline);

  const meta = document.createElement('p');
  meta.className = 'agenda-card-meta';
  meta.textContent = [stringify(event.raw.location), stringify(event.raw.presenter)].filter(Boolean).join(' · ');
  article.appendChild(meta);

  const desc = document.createElement('p');
  desc.className = 'agenda-card-desc';
  desc.textContent = [stringify(event.raw.desc), stringify(event.raw.info)].filter(Boolean).join(' · ');
  article.appendChild(desc);

  const fields = document.createElement('dl');
  fields.className = 'agenda-card-fields';
  for (const [label, value] of [
    ['Category', event.raw.category],
    ['Block', event.raw.block],
    ['Mandatory', event.raw.mand],
    ['Group', event.raw.group],
  ]) {
    const text = stringify(value);
    if (!text) continue;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = text;
    fields.append(dt, dd);
  }
  article.appendChild(fields);

  return article;
}

function renderStats(nowKey) {
  const upcoming = state.filtered.filter((event) => event.endKey >= nowKey).length;
  els.eventCount.textContent = String(state.events.length);
  els.upcomingCount.textContent = String(upcoming);
  els.activeMCal.textContent = state.activeMCal;
}

function renderMCalChips() {
  els.mCalChips.innerHTML = MCAL_OPTIONS.map((value) => {
    const active = value === state.activeMCal ? ' is-active' : '';
    return `<button type="button" class="mcal-chip${active}" data-mcal="${escapeHtml(value)}" aria-pressed="${value === state.activeMCal}">${escapeHtml(value)}</button>`;
  }).join('');

  els.mCalChips.querySelectorAll('button[data-mcal]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeMCal = button.dataset.mcal || 'All';
      applyFilters();
      syncUrlFromState();
    });
  });
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

    select.innerHTML = ['<option value="">All</option>', ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join('');
  }

  syncInputsFromFilters();
}

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
  button.textContent = 'Copied';
  window.setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function downloadFilteredIcs() {
  const blob = new Blob([buildIcs(state.filtered)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.filtered.length ? 'calendar.filtered.ics' : 'calendar.ics';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildIcs(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//GitHub Pages Calendar Mirror//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
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

function updateHeader() {
  els.calendarTitle.textContent = getViewTitle(state.view, state.anchorDate);
}

function getViewTitle(view, date) {
  if (view === 'month') {
    return `${monthName(date.month)} ${date.year}`;
  }

  if (view === 'week') {
    const range = getViewRange('week', date);
    return `${formatLongDate(range.start)} – ${formatLongDate(range.end)}`;
  }

  return formatLongDate(date);
}

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
  return [event.title, formatTimeRange(event.date, event.start, event.end), stringify(event.raw.location)].filter(Boolean).join(' • ');
}

function setLoadedAt() {
  els.lastUpdated.textContent = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function renderError(error) {
  console.error(error);
  els.calendarView.innerHTML = '';
  const message = makeMessage('Unable to load events.json. Check the source feed or refresh after the Action runs.');
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

function buildSearchText(event) {
  return [event.title, event.desc, event.info, event.presenter, event.location]
    .map((value) => stringify(value).toLowerCase())
    .join(' ');
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDate(year, month, day) ? { year, month, day } : null;
  }

  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!mmddyyyy) {
    return null;
  }

  const month = Number(mmddyyyy[1]);
  const day = Number(mmddyyyy[2]);
  const year = Number(mmddyyyy[3]);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(stringify(value));
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }

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
  return `${monthName(date.month)} ${date.day}, ${date.year}`;
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

function formatTimeLabel(time) {
  return formatShortTime(time);
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
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)} ${timezoneAbbrev(date, start)}`;
}

function monthName(month) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || 'Unknown';
}

function weekdayLong(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(toUtcDate(date));
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
  if (!normalized) {
    return '';
  }
  if (['yes', 'y', 'true', '1'].includes(normalized)) {
    return 'Yes';
  }
  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return 'No';
  }
  return stringify(value);
}

function stringify(value) {
  return value == null ? '' : String(value).trim();
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
