const TIMEZONE = 'America/Chicago';
const EVENTS_PATH = 'events.json';

const state = {
  events: [],
  filtered: [],
  filters: {
    query: '',
    category: '',
    block: '',
    mCal: '',
    mand: '',
    group: '',
  },
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindElements();
  bindEvents();
  syncFiltersFromUrl();
  setIcsUrl();

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
    'searchInput',
    'categoryFilter',
    'blockFilter',
    'mCalFilter',
    'mandFilter',
    'groupFilter',
    'resetFilters',
    'downloadFilteredIcs',
    'eventList',
    'resultSummary',
    'activeFilterChips',
    'eventCount',
    'upcomingCount',
    'mCalCount',
    'lastUpdated',
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.copyIcsUrl.addEventListener('click', copyIcsUrl);
  els.resetFilters.addEventListener('click', resetFilters);
  els.downloadFilteredIcs.addEventListener('click', downloadFilteredIcs);

  els.searchInput.addEventListener('input', updateFiltersFromInputs);
  els.categoryFilter.addEventListener('change', updateFiltersFromInputs);
  els.blockFilter.addEventListener('change', updateFiltersFromInputs);
  els.mCalFilter.addEventListener('change', updateFiltersFromInputs);
  els.mandFilter.addEventListener('change', updateFiltersFromInputs);
  els.groupFilter.addEventListener('change', updateFiltersFromInputs);
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

function syncFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.filters.query = params.get('q') || '';
  state.filters.category = params.get('category') || '';
  state.filters.block = params.get('block') || '';
  state.filters.mCal = params.get('mCal') || '';
  state.filters.mand = params.get('mand') || '';
  state.filters.group = params.get('group') || '';
}

function updateFiltersFromInputs() {
  state.filters.query = els.searchInput.value.trim();
  state.filters.category = els.categoryFilter.value;
  state.filters.block = els.blockFilter.value;
  state.filters.mCal = els.mCalFilter.value;
  state.filters.mand = els.mandFilter.value;
  state.filters.group = els.groupFilter.value;
  applyFilters();
  syncUrlFromFilters();
}

function syncInputsFromFilters() {
  els.searchInput.value = state.filters.query;
  els.categoryFilter.value = state.filters.category;
  els.blockFilter.value = state.filters.block;
  els.mCalFilter.value = state.filters.mCal;
  els.mandFilter.value = state.filters.mand;
  els.groupFilter.value = state.filters.group;
}

function syncUrlFromFilters() {
  const params = new URLSearchParams();
  if (state.filters.query) params.set('q', state.filters.query);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.block) params.set('block', state.filters.block);
  if (state.filters.mCal) params.set('mCal', state.filters.mCal);
  if (state.filters.mand) params.set('mand', state.filters.mand);
  if (state.filters.group) params.set('group', state.filters.group);

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function resetFilters() {
  state.filters = { query: '', category: '', block: '', mCal: '', mand: '', group: '' };
  syncInputsFromFilters();
  applyFilters();
  syncUrlFromFilters();
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

  const date = parseDate(event.date);
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
    startKey: makeDateKey(date, start),
    endKey: makeDateKey(date, normalizedEnd),
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
  renderEvents(nowKey);
  renderStats(nowKey);
  renderChips();
}

function matchesFilters(event) {
  const filters = state.filters;
  if (filters.query && !event.searchText.includes(filters.query.toLowerCase())) {
    return false;
  }
  if (filters.category && getFieldValue(event.raw.category) !== filters.category) {
    return false;
  }
  if (filters.block && getFieldValue(event.raw.block) !== filters.block) {
    return false;
  }
  if (filters.mCal && getFieldValue(event.raw.mCal) !== filters.mCal) {
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

function renderEvents(nowKey) {
  const list = els.eventList;
  list.innerHTML = '';

  if (!state.filtered.length) {
    list.appendChild(makeMessage('No matching events found. Try clearing a filter or broadening the search.'));
    els.resultSummary.textContent = '0 events matched';
    return;
  }

  const template = document.getElementById('eventTemplate');
  const fragment = document.createDocumentFragment();

  for (const event of state.filtered) {
    const card = template.content.firstElementChild.cloneNode(true);
    const upcoming = event.endKey >= nowKey;
    const detailFields = [];

    card.querySelector('.event-date').textContent = formatLongDate(event.date);
    card.querySelector('.event-title').textContent = event.title;
    card.querySelector('.event-badge').textContent = upcoming ? 'Upcoming' : 'Past';
    card.querySelector('.event-time').textContent = formatTimeRange(event.date, event.start, event.end);
    card.querySelector('.event-desc').textContent = [stringify(event.raw.desc), stringify(event.raw.info)].filter(Boolean).join(' · ');
    card.querySelector('.event-meta').textContent = [stringify(event.raw.location), stringify(event.raw.presenter)].filter(Boolean).join(' · ');

    addField(detailFields, 'Category', event.raw.category);
    addField(detailFields, 'Block', event.raw.block);
    addField(detailFields, 'mCal', event.raw.mCal);
    addField(detailFields, 'Mandatory', event.raw.mand);
    addField(detailFields, 'Group', event.raw.group);
    addField(detailFields, 'Week', event.raw.week);
    addField(detailFields, 'Cal Year', event.raw.calYear);

    card.querySelector('.event-fields').innerHTML = detailFields
      .map(({ label, value }) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
      .join('');

    fragment.appendChild(card);
  }

  list.appendChild(fragment);
  els.resultSummary.textContent = `${state.filtered.length} event${state.filtered.length === 1 ? '' : 's'} matched`;
}

function renderStats(nowKey) {
  const upcoming = state.filtered.filter((event) => event.endKey >= nowKey).length;
  const mCalValues = new Set(state.events.map((event) => getFieldValue(event.raw.mCal)).filter(Boolean));
  els.eventCount.textContent = String(state.events.length);
  els.upcomingCount.textContent = String(upcoming);
  els.mCalCount.textContent = String(mCalValues.size);
}

function renderChips() {
  const chips = [];
  for (const [label, value] of [
    ['Search', state.filters.query],
    ['Category', state.filters.category],
    ['Block', state.filters.block],
    ['mCal', state.filters.mCal],
    ['Mandatory', state.filters.mand],
    ['Group', state.filters.group],
  ]) {
    if (value) {
      chips.push(`<span class="chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`);
    }
  }
  els.activeFilterChips.innerHTML = chips.join('');
}

function populateFilterOptions(events) {
  const fields = [
    ['category', els.categoryFilter],
    ['block', els.blockFilter],
    ['mCal', els.mCalFilter],
    ['mand', els.mandFilter],
    ['group', els.groupFilter],
  ];

  for (const [field, select] of fields) {
    const values = [...new Set(events.map((event) => getFieldValue(event.raw[field]) || getMandatoryValue(event.raw[field])))].filter(Boolean).sort((a, b) => a.localeCompare(b));
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
    lines.push(`DTSTART;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.start)}`);
    lines.push(`DTEND;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

    const description = buildDescription(event.raw);
    if (description) {
      lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    }

    if (stringify(event.raw.location)) {
      lines.push(`LOCATION:${escapeIcsText(event.raw.location)}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return foldIcsLines(lines);
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
  els.eventList.innerHTML = '';
  const message = makeMessage('Unable to load events.json. Check the source feed or refresh after the Action runs.');
  message.classList.add('error-state');
  els.eventList.appendChild(message);
  els.resultSummary.textContent = 'Feed unavailable';
}

function makeMessage(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

function addField(fields, label, value) {
  const text = stringify(value);
  if (text) {
    fields.push({ label, value: text });
  }
}

function buildSearchText(event) {
  return [event.title, event.desc, event.info, event.presenter, event.location]
    .map((value) => stringify(value).toLowerCase())
    .join(' ');
}

function parseDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(stringify(value));
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!isValidDate(year, month, day)) {
    return null;
  }

  return { year, month, day };
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

function makeDateKey(date, time) {
  return Number(`${date.year}${pad(date.month)}${pad(date.day)}${pad(time.hour)}${pad(time.minute)}`);
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

function formatLongDate(date) {
  return `${monthName(date.month)} ${date.day}, ${date.year}`;
}

function formatTimeRange(date, start, end) {
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)} ${timezoneAbbrev(date, start)}`;
}

function formatTimeLabel(time) {
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

function formatUtcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatIcsDateTime(date, time) {
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

function monthName(month) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || 'Unknown';
}

function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function escapeHtml(value) {
  return stringify(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
