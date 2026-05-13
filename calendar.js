const TIMEZONE = 'America/Chicago';
const EVENTS_PATH = 'events.json';
const MCAL_OPTIONS = ['All', 'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

const state = {
  events: [],
  filtered: [],
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
  setIcsUrl();
  renderMCalChips();
  syncFiltersFromUrl();

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
    'mandFilter',
    'groupFilter',
    'resetFilters',
    'eventList',
    'resultSummary',
    'eventCount',
    'upcomingCount',
    'activeMCal',
    'lastUpdated',
    'mCalChips',
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.copyIcsUrl.addEventListener('click', copyIcsUrl);
  els.resetFilters.addEventListener('click', resetFilters);
  els.searchInput.addEventListener('input', updateFiltersFromInputs);
  els.categoryFilter.addEventListener('change', updateFiltersFromInputs);
  els.blockFilter.addEventListener('change', updateFiltersFromInputs);
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
  state.filters.mand = params.get('mand') || '';
  state.filters.group = params.get('group') || '';
  state.activeMCal = params.get('mCal') || 'All';
  if (!MCAL_OPTIONS.includes(state.activeMCal)) {
    state.activeMCal = 'All';
  }
}

function updateFiltersFromInputs() {
  state.filters.query = els.searchInput.value.trim();
  state.filters.category = els.categoryFilter.value;
  state.filters.block = els.blockFilter.value;
  state.filters.mand = els.mandFilter.value;
  state.filters.group = els.groupFilter.value;
  applyFilters();
  syncUrlFromFilters();
}

function syncInputsFromFilters() {
  els.searchInput.value = state.filters.query;
  els.categoryFilter.value = state.filters.category;
  els.blockFilter.value = state.filters.block;
  els.mandFilter.value = state.filters.mand;
  els.groupFilter.value = state.filters.group;
}

function syncUrlFromFilters() {
  const params = new URLSearchParams();
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
  syncInputsFromFilters();
  renderMCalChips();
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

function renderEvents(nowKey) {
  const list = els.eventList;
  list.innerHTML = '';

  if (!state.filtered.length) {
    list.appendChild(makeMessage('No matching events found. Try a different mCal chip or clear one of the filters.'));
    els.resultSummary.textContent = '0 events matched';
    return;
  }

  const template = document.getElementById('eventTemplate');
  const fragment = document.createDocumentFragment();
  const grouped = groupByDate(state.filtered);

  for (const [dateKey, events] of grouped) {
    const groupSection = document.createElement('section');
    groupSection.className = 'calendar-group';

    const heading = document.createElement('div');
    heading.className = 'calendar-group-heading';
    heading.innerHTML = `<h3>${escapeHtml(formatLongDate(events[0].date))}</h3><span>${events.length} event${events.length === 1 ? '' : 's'}</span>`;
    groupSection.appendChild(heading);

    const cards = document.createElement('div');
    cards.className = 'calendar-group-cards';

    for (const event of events) {
      const card = template.content.firstElementChild.cloneNode(true);
      const upcoming = event.endKey >= nowKey;
      const detailFields = [];

      card.querySelector('.calendar-event-date').textContent = formatLongDate(event.date);
      card.querySelector('.calendar-event-title').textContent = event.title;
      card.querySelector('.calendar-event-badge').textContent = `${getFieldValue(event.raw.mCal) || 'No mCal'} ${upcoming ? 'Upcoming' : 'Past'}`;
      card.querySelector('.calendar-event-time').textContent = formatTimeRange(event.date, event.start, event.end);
      card.querySelector('.calendar-event-desc').textContent = [stringify(event.raw.desc), stringify(event.raw.info)].filter(Boolean).join(' · ');
      card.querySelector('.calendar-event-meta').textContent = [stringify(event.raw.location), stringify(event.raw.presenter)].filter(Boolean).join(' · ');

      addField(detailFields, 'Category', event.raw.category);
      addField(detailFields, 'Block', event.raw.block);
      addField(detailFields, 'mCal', event.raw.mCal);
      addField(detailFields, 'Mandatory', event.raw.mand);
      addField(detailFields, 'Group', event.raw.group);
      addField(detailFields, 'Week', event.raw.week);
      addField(detailFields, 'Cal Year', event.raw.calYear);

      card.querySelector('.calendar-event-fields').innerHTML = detailFields
        .map(({ label, value }) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join('');

      cards.appendChild(card);
    }

    groupSection.appendChild(cards);
    fragment.appendChild(groupSection);
  }

  list.appendChild(fragment);
  els.resultSummary.textContent = `${state.filtered.length} event${state.filtered.length === 1 ? '' : 's'} matched`;
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
    const label = value === 'All' ? 'All' : value;
    return `<button type="button" class="mcal-chip${active}" data-mcal="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }).join('');

  els.mCalChips.querySelectorAll('button[data-mcal]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeMCal = button.dataset.mcal || 'All';
      renderMCalChips();
      applyFilters();
      syncUrlFromFilters();
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

function groupByDate(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = `${event.date.year}-${pad(event.date.month)}-${pad(event.date.day)}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(event);
  }
  return grouped;
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
