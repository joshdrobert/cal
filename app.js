/* ═══════════════════════════════════════════════════════════════
   EnMed Dashboard – Clean Home Page
   ═══════════════════════════════════════════════════════════════ */

const TIMEZONE = 'America/Chicago';
const EVENTS_PATH = 'events.json';

const state = {
  events: [],
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setIcsUrls();
  bindCopyButtons();
  bindDownloadModal();

  try {
    const response = await fetch(EVENTS_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load ${EVENTS_PATH}: ${response.status}`);

    const data = await response.json();
    state.events = normalizeEvents(Array.isArray(data) ? data : []);
    renderStats();
  } catch (error) {
    console.error(error);
  }
}

/* ── ICS URLs ─────────────────────────────────────────────────── */
function setIcsUrls() {
  const base = buildBaseUrl();
  const urls = {
    icsUrlFull: `${base}/calendar.ics`,
    icsUrlM0: `${base}/calendar-m0.ics`,
    icsUrlM1: `${base}/calendar-m1.ics`,
    icsUrlM2: `${base}/calendar-m2.ics`,
  };

  for (const [id, url] of Object.entries(urls)) {
    const el = document.getElementById(id);
    if (el) el.value = url;
  }
}

function buildBaseUrl() {
  const hostname = window.location.hostname || '';
  const isGithubPages = hostname.endsWith('.github.io');
  const owner = isGithubPages ? hostname.replace(/\.github\.io$/, '') : 'OWNER';
  const segments = window.location.pathname.split('/').filter(Boolean);
  const repo = segments[0] || 'REPO';
  return `https://${owner}.github.io/${repo}`;
}

/* ── COPY BUTTONS ─────────────────────────────────────────────── */
function bindCopyButtons() {
  document.querySelectorAll('.dash-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.dataset.copy;
      const input = document.getElementById(inputId);
      if (!input) return;

      const text = input.value;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => showCopyFeedback(btn)).catch(() => fallbackCopy(input, btn));
      } else {
        fallbackCopy(input, btn);
      }
    });
  });
}

function fallbackCopy(input, btn) {
  input.focus();
  input.select();
  document.execCommand('copy');
  showCopyFeedback(btn);
}

function showCopyFeedback(btn) {
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  btn.classList.add('is-copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('is-copied');
  }, 1500);
}

/* ── DOWNLOAD MODAL ───────────────────────────────────────────── */
function bindDownloadModal() {
  const modal = document.getElementById('downloadModal');
  const openBtn = document.getElementById('downloadIcsBtn');
  const closeBtn = document.getElementById('closeDownloadModal');

  openBtn.addEventListener('click', () => {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  });

  closeBtn.addEventListener('click', closeDownloadModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDownloadModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDownloadModal();
  });

  // Download option buttons
  document.querySelectorAll('.dash-dl-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const calendar = btn.dataset.calendar;
      downloadCalendar(calendar);
      closeDownloadModal();
    });
  });
}

function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('is-open');
  document.body.style.overflow = '';
}

function downloadCalendar(calendarType) {
  let events = state.events;
  let filename = 'enmed-calendar.ics';
  let calName = 'EnMed Calendar';

  if (calendarType !== 'full') {
    events = state.events.filter(e => {
      const mCal = stringify(e.raw.mCal);
      if (mCal === calendarType) return true;
      // Program-Wide events go into M0/M1/M2
      if (mCal === 'Program-Wide' && ['M0', 'M1', 'M2'].includes(calendarType)) return true;
      return false;
    });
    filename = `enmed-${calendarType.toLowerCase()}-calendar.ics`;
    calName = `EnMed ${calendarType} Calendar`;
  }

  const blob = new Blob([buildIcs(events, calName)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ── STATS ────────────────────────────────────────────────────── */
function renderStats() {
  const nowKey = getChicagoNowKey();
  const upcoming = state.events.filter(e => e.endKey >= nowKey).length;

  const el = (id) => document.getElementById(id);
  el('eventCount').textContent = String(state.events.length);
  el('upcomingCount').textContent = String(upcoming);
  el('lastUpdated').textContent = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

/* ── EVENT NORMALIZATION ──────────────────────────────────────── */
function normalizeEvents(events) {
  return events
    .map((event, index) => normalizeEvent(event, index))
    .filter(Boolean)
    .sort(compareEvents);
}

function normalizeEvent(event, index) {
  if (!event || typeof event !== 'object') return null;

  const date = parseDate(event.date);
  const start = parseTime(event.start);
  if (!date || !start) return null;

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
  };
}

function compareEvents(a, b) {
  return a.startKey - b.startKey || a.endKey - b.endKey || a.index - b.index;
}

/* ── ICS BUILDER ──────────────────────────────────────────────── */
function buildIcs(events, calName = 'EnMed Calendar') {
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
    lines.push(`DTSTART;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.start)}`);
    lines.push(`DTEND;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);

    const description = buildDescription(event.raw);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (stringify(event.raw.location)) lines.push(`LOCATION:${escapeIcsText(event.raw.location)}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return foldIcsLines(lines);
}

function buildDescription(event) {
  return [
    ['desc', event.desc], ['info', event.info], ['presenter', event.presenter],
    ['category', event.category], ['block', event.block], ['week', event.week],
    ['calYear', event.calYear], ['mCal', event.mCal], ['mand', event.mand],
    ['group', event.group],
  ]
    .filter(([, value]) => stringify(value))
    .map(([label, value]) => `${label}: ${stringify(value)}`)
    .join('\n');
}

function timezoneComponent() {
  return [
    'BEGIN:VTIMEZONE', 'TZID:America/Chicago', 'X-LIC-LOCATION:America/Chicago',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0500', 'TZNAME:CDT',
    'DTSTART:20070311T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0600', 'TZNAME:CST',
    'DTSTART:20071104T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

/* ── UTILITIES ────────────────────────────────────────────────── */
function parseDate(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(stringify(value));
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(stringify(value));
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return (hour > 23 || minute > 59) ? null : { hour, minute };
}

function addMinutes(time, minutes) {
  const total = time.hour * 60 + time.minute + minutes;
  return { hour: Math.floor((total % (24 * 60)) / 60), minute: total % 60 };
}

function compareTime(a, b) { return a.hour * 60 + a.minute - (b.hour * 60 + b.minute); }

function makeDateKey(date, time) {
  return Number(`${date.year}${pad(date.month)}${pad(date.day)}${pad(time.hour)}${pad(time.minute)}`);
}

function getChicagoNowKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return Number(`${map.year}${map.month}${map.day}${map.hour}${map.minute}`);
}

function formatUtcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatIcsDateTime(date, time) {
  return `${date.year}${pad(date.month)}${pad(date.day)}T${pad(time.hour)}${pad(time.minute)}00`;
}

function foldIcsLines(lines) { return lines.map(l => foldIcsLine(l)).join('\r\n') + '\r\n'; }

function foldIcsLine(line) {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 75) { chunks.push(remaining.slice(0, 75)); remaining = ` ${remaining.slice(75)}`; }
  chunks.push(remaining);
  return chunks.join('\r\n');
}

function escapeIcsText(value) {
  return stringify(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function sanitizeUidPart(value) {
  return stringify(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'event';
}

function stringify(value) { return value == null ? '' : String(value).trim(); }
function pad(value) { return String(value).padStart(2, '0'); }

function isValidDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}
