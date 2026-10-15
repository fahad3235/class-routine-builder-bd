# TEST RESULTS — class-routine-builder-bd (run #67, 2026-10-15, 13:00 slot)

## Unit tests (node --test tests/test-logic.mjs)
**54/54 pass, 0 fail.**

Coverage: time conversion round-trips; overlap boundaries (end == start = no overlap);
conflict rules — same-room overlap rejected, same-teacher overlap rejected,
different room + teacher overlap allowed, same-course overlap rejected;
nowNext — in-progress, next-today, wrap-to-next-week, Friday empty;
import validation — wrong app, bad version, invalid times, Friday class,
conflicting classes, duplicate ids, error names first problem;
Bengali digit conversion both directions; formatMinutes/formatCount BN honor;
day names (7 days, Sat first, Fri last); sortEntries by day then start.

Hand-verified examples:
- Room conflict: CIS131 Sat 09:00–10:30 room 301 vs CIS132 Sat 10:00–11:00 room 301 → conflict (shared 10:00–10:30, same room).
- Teacher conflict: same two classes, different rooms, same teacher → conflict.
- Allowed: same two classes, different rooms, different teachers → no conflict.
- Adjacent: 09:00–10:00 then 10:00–11:00 same room → no conflict (touching is not overlapping).

## Smoke tests (headless Chrome, raw CDP, file:// + ?asof=)
**36/36 pass, 0 fail, 0 console/page errors, 0 http(s) network requests.**

Coverage: add course, add class, conflict error shown, grid block renders,
now/next (in-progress CIS131 Mon 09:30; next Tue CIS132), asof preview badge,
Friday now-empty + next wraps to Monday CIS131, delete entry removes block,
edit course updates name, BN toggle renders Bengali title + Bengali digits,
BN persists after reload, export JSON has app id + courses, typed-DELETE erase,
import of exported JSON succeeds + restores courses, malformed import (wrong app,
invalid JSON) rejected with data intact, lowercase "delete" rejected,
print button exists, 390px no horizontal overflow (scrollWidth <= 391),
data persists across reload (localStorage).

## Repairs
0 app-logic bugs found by tests. TEST_RESULTS.md was created empty by the build
worker; this file was filled in by the parent after re-running both suites.

## Source hygiene
`grep -rP '[^\x00-\x7F]'` over all source files: zero matches (pure ASCII;
Bengali emitted as \uXXXX escapes).
