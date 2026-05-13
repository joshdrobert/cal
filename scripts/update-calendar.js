#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_URL = process.env.SOURCE_URL || 'https://raw.githubusercontent.com/tamu-edu/enmed-pct-calendar/main/events.json';
const TIMEZONE = 'America/Chicago';

async function main() {
  const sourceEvents = await fetchSourceEvents(SOURCE_URL);
  const normalizedEvents = normalizeEvents(sourceEvents);

  await writeJsonIfChanged(path.join(ROOT, 'events.json'), sourceEvents);
  await writeTextIfChanged(path.join(ROOT, 'calendar.ics'), buildIcs(normalizedEvents));
}

async function fetchSourceEvents(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch source feed (${response.status} ${response.statusText})`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Source feed did not return an array of events');
  }

  return data;
}

function normalizeEvents(events) {
  const normalized = [];
  events.forEach((event, index) => {
    const normalizedEvent = normalizeEvent(event, index);
    if (normalizedEvent) {
      normalized.push(normalizedEvent);
    }
  });
  normalized.sort(compareEvents);
  return normalized;
}

function normalizeEvent(event, index) {
  if (!event || typeof event !== 'object') {
    console.warn(`Skipping invalid event at index ${index}: not an object`);
    return null;
  }

  const date = parseDate(event.date);
  const start = parseTime(event.start);
  if (!date) {
    console.warn(`Skipping invalid event at index ${index}: bad date ${JSON.stringify(event.date)}`);
    return null;
  }
  if (!start) {
    console.warn(`Skipping invalid event at index ${index}: bad start time ${JSON.stringify(event.start)}`);
    return null;
  }

  const parsedEnd = event.end ? parseTime(event.end) : null;
  const end = parsedEnd && compareTime(parsedEnd, start) > 0 ? parsedEnd : addMinutes(start, 60);
  if (event.end && !parsedEnd) {
    console.warn(`Defaulting invalid end time for event at index ${index}: ${JSON.stringify(event.end)}`);
  }
  if (parsedEnd && compareTime(parsedEnd, start) <= 0) {
    console.warn(`Defaulting non-forward end time for event at index ${index}: ${JSON.stringify(event.end)}`);
  }

  const title = stringify(event.title) || 'Untitled event';
  const uidSource = event._id || `${title}-${event.date || index}-${event.start || 'start'}`;

  return {
    raw: event,
    index,
    title,
    date,
    start,
    end,
    uid: `${sanitizeUidPart(uidSource)}@enmed-pct-calendar`,
    startKey: makeDateKey(date, start),
    endKey: makeDateKey(date, end),
  };
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

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(event.uid)}`);
    lines.push(`DTSTAMP:${formatUtcStamp(new Date())}`);
    lines.push(`DTSTART;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.start)}`);
    lines.push(`DTEND;TZID=${TIMEZONE}:${formatIcsDateTime(event.date, event.end)}`);
    lines.push(`SUMMARY:${escapeIcsText(stringify(event.title))}`);

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

function compareEvents(a, b) {
  return a.startKey - b.startKey || a.endKey - b.endKey || String(a.uid).localeCompare(String(b.uid));
}

function makeDateKey(date, time) {
  return Number(`${date.year}${pad(date.month)}${pad(date.day)}${pad(time.hour)}${pad(time.minute)}`);
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

async function writeJsonIfChanged(filePath, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  await writeTextIfChanged(filePath, next);
}

async function writeTextIfChanged(filePath, next) {
  let current = null;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (current === next) {
    return;
  }

  await fs.writeFile(filePath, next, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, filePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
