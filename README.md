# EnMed Calendar Mirror

This repository mirrors the public EnMed PCT calendar feed, generates a subscribeable ICS file, and serves a simple static dashboard from GitHub Pages.

Repository URL: https://github.com/joshdrobert/cal.git

## What it does

- Downloads the public `events.json` feed from the source repository.
- Saves the latest copy as `events.json` in this repo.
- Generates `calendar.ics` with stable event UIDs and `America/Chicago` timezone data.
- Serves a mobile-friendly dashboard that can search and filter the calendar.

## Files

- `index.html` - dashboard shell.
- `styles.css` - presentation and mobile layout.
- `app.js` - client-side data loading, filters, search, and filtered ICS download.
- `events.json` - mirrored source feed.
- `calendar.ics` - generated subscription calendar.
- `scripts/update-calendar.js` - Node script used by GitHub Actions.
- `.github/workflows/deploy-pages.yml` - GitHub Pages deployment workflow.
- `.github/workflows/update-calendar.yml` - scheduled and manual refresh workflow.

## How the update Action works

The workflow runs every 30 minutes and can also be started manually.

1. `actions/checkout` checks out the repo.
2. `actions/setup-node` installs Node.js.
3. `node scripts/update-calendar.js` fetches the source feed from:
   `https://raw.githubusercontent.com/tamu-edu/enmed-pct-calendar/main/events.json`
4. The script writes refreshed `events.json` and `calendar.ics`.
5. The workflow commits and pushes only when either file changed.

The workflow uses only the default `GITHUB_TOKEN`; no extra secrets are required.

## Enabling GitHub Pages

1. Open repository settings in GitHub.
2. Go to `Pages`.
3. Set the source to `GitHub Actions`.
4. Save the settings.
5. Push to `main` or run the `Deploy site to GitHub Pages` workflow manually.

Once published, the ICS URL will follow this pattern:

`https://OWNER.github.io/REPO/calendar.ics`

For this repo, that becomes:

`https://joshdrobert.github.io/cal/calendar.ics`

## Google Calendar subscription

1. Open Google Calendar.
2. In the left sidebar, use `Other calendars +`.
3. Choose `From URL`.
4. Paste the published `calendar.ics` URL.
5. Add the calendar.

Google Calendar may take several hours to refresh a subscribed ICS feed.

## Filtering

The dashboard filters by:

- category
- block
- mCal
- mandatory status
- group
- search across title, desc, info, presenter, and location

The page keeps filter state in the URL, so filtered views can be shared directly.

The dashboard also includes a `Download filtered ICS` button that exports the currently filtered events as a local ICS file.

## Changing the source URL

Edit `SOURCE_URL` in `scripts/update-calendar.js` if the upstream feed changes.

You can also override it for one run with an environment variable:

```bash
SOURCE_URL="https://example.com/events.json" node scripts/update-calendar.js
```

## Limitations

- Google Calendar may take several hours to refresh subscribed ICS feeds.
- ICS subscriptions are one-way; edits must happen in the source feed and then be regenerated here.
- The dashboard is static and reads the mirrored `events.json` file directly.

## Local development

Open the repo in a static file server or run any simple local server that serves the root directory. The dashboard reads `events.json` from the same folder.
