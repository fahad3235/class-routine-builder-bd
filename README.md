# Class Routine Builder BD

Offline, bilingual (English / Bangla) weekly class-routine builder for Bangladeshi
students. Plan a Saturday-Thursday week: add courses, schedule classes, see
conflicts before they happen, check what is happening "Now & Next", and print
a clean weekly grid. No server, no sign-in, no network requests - everything
stays in the browser's localStorage.

## Problem

Students juggle course codes, teachers, rooms, and overlapping times across a
six-day (Saturday-Thursday) week. A paper routine goes stale the moment a
class moves; a spreadsheet does not warn you when two classes book the same
room. This tool keeps one editable routine, rejects overlapping bookings that
share a room or a teacher, and answers "what is my next class?" at a glance.

## Features

1. **Course CRUD** - code (e.g. `CIS131`), name, teacher, room, one of 6 preset
   colors. Inline validation: code 2-12 chars (letters/digits/dash), name
   required (max 80), teacher/room optional (max 60). Edit + delete; delete is
   blocked with an inline error while scheduled classes still use the course.
2. **Class entries + conflict detection** - pick a course, day (Sat-Thu), start
   and end time (HH:MM, end > start, within 07:00-21:00). Overlapping entries
   on the same day are rejected if they share the same room OR the same
   teacher (case-insensitive, trimmed), or if they are the same course. The
   inline error names the conflicting class. Entries are listed grouped by day
   with per-entry edit/delete.
3. **Weekly grid view** - Sat-Thu columns, rows 07:00-21:00. Classes render as
   colored blocks positioned by time. Click a block to delete it (confirm).
   Empty state when no classes exist.
4. **"Now & Next" panel** - shows the class in progress ("Now") and the next
   upcoming class (today, else later this week wrapping to next week), with
   "X min left" / "starts in ...". On Friday it shows "No classes today" and the
   next class (Saturday onwards). Supports `?asof=YYYY-MM-DDTHH:MM` to preview
   any moment (used by the smoke tests).
5. **Print** - print CSS prints only the weekly grid + title (forms/buttons
   hidden), landscape-friendly. The "Print routine" button calls
   `window.print()`.
6. **Data** - JSON export (`{app, version, courses, classes}`), strict import
   validation (wrong app/version, bad types, invalid times, unknown course
   refs, or conflicts reject the whole file; existing data stays intact and
   the first problem is reported), typed-`DELETE` erase-all, localStorage
   persistence, EN/Bangla toggle (persisted) with Bengali digits (0-9 (Bengali digits)) for
   times/counts in BN mode, 390px mobile layout (grid scrolls horizontally,
   no page overflow).

Footer disclaimer: personal planning tool, not an official university routine.

## Stack

Pure static site. Zero network requests, no frameworks, no CDN.

- `index.html` - structure
- `css/style.css` - styles + print CSS
- `js/logic.js` - pure functions, no DOM (time math, conflicts, now/next,
  import validation, digit conversion)
- `js/i18n.js` - EN/BN strings
- `js/app.js` - DOM layer, persistence, export/import
- `tests/test-logic.mjs` - unit tests (`node --test`)
- `tests/smoke.mjs` - headless-Chrome smoke tests via raw CDP

All sources are pure ASCII: Bengali text appears only as `\uXXXX` escapes in
JavaScript (verified with `grep -rP '[^\x00-\x7F]'` returning zero matches).

## Prerequisites

- Any modern browser (Chrome/Edge/Firefox/Safari). No build step.
- For tests: Node.js 20+ and Chrome at `/opt/meta-chromium/chrome`
  (or set `CHROME` - the smoke script uses that fixed path in this VM).

## Install / Run

```bash
# Just open the file - no server needed:
open index.html
# or serve it locally:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Dev commands

```bash
# Unit tests (node --test)
node --test tests/test-logic.mjs

# Smoke tests (headless Chrome via raw CDP)
node tests/smoke.mjs

# ASCII check (must print nothing)
grep -rP '[^\x00-\x7F]' index.html css js tests README.md || echo "ASCII clean"
```

## Environment

No environment variables, no secrets, no backend. Data lives in
`localStorage` under key `crb-data-v1` (language under `crb-lang`).

## Testing

See `TEST_RESULTS.md` for the recorded real numbers. Unit tests cover time
conversion round-trips, overlap boundaries (`end == start` = no overlap),
all conflict rules, now/next (in-progress, next today, wrap to next week,
Friday empty), import validation (malformed cases), and Bengali digit
conversion. Smoke tests cover the full UI flow in headless Chrome: add
course/class, conflict error, grid block geometry, now/next with `?asof=`,
delete, BN toggle + persistence, export -> erase -> import round-trip,
malformed import rejection, print button, 390px overflow check, and zero
network requests / zero console errors.

## Deployment

Copy the whole folder to any static host (GitHub Pages, Netlify Drop, or any
file server). It is a single static site with relative asset paths.

## Limitations

- Single-device: data lives in one browser's localStorage; no sync, no
  accounts, no sharing link.
- One routine at a time (no multiple timetables / semesters).
- Friday is always class-free by design (Sat-Thu week); Friday classes cannot
  be scheduled.
- Conflict rules cover room, teacher, and same-course overlaps only - they do
  not check travel time between rooms or student-level clashes.
- Print output depends on the browser's print engine; colors require
  "Background graphics" enabled in the print dialog on some browsers.
- `?asof=` is a preview aid, not a timezone control; times are local time.

## Status

MVP complete. Unit + smoke tests green (see `TEST_RESULTS.md`).
