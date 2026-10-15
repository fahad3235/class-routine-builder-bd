/* Unit tests for js/logic.js - node --test. Pure ASCII. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');

function course(code, name, teacher, room, color) {
  return { code, name, teacher: teacher || '', room: room || '', color: color || '#2563eb' };
}
function cls(id, courseCode, day, start, end) {
  return { id, courseCode, day, start, end };
}
function dateAt(y, mo, d, h, mi) { return new Date(y, mo - 1, d, h, mi, 0, 0); }
// 2026-10-12 is a Monday. 2026-10-16 is a Friday. 2026-10-17 is a Saturday.

// --- time conversion ---
test('timeToMin converts HH:MM', () => {
  assert.equal(L.timeToMin('00:00'), 0);
  assert.equal(L.timeToMin('07:00'), 420);
  assert.equal(L.timeToMin('09:30'), 570);
  assert.equal(L.timeToMin('21:00'), 1260);
  assert.equal(L.timeToMin('23:59'), 1439);
});
test('timeToMin rejects bad input', () => {
  assert.ok(isNaN(L.timeToMin('9:00')));
  assert.ok(isNaN(L.timeToMin('24:00')));
  assert.ok(isNaN(L.timeToMin('09:60')));
  assert.ok(isNaN(L.timeToMin('abc')));
  assert.ok(isNaN(L.timeToMin('')));
  assert.ok(isNaN(L.timeToMin(930)));
  assert.ok(isNaN(L.timeToMin(null)));
});
test('minToTime converts minutes', () => {
  assert.equal(L.minToTime(0), '00:00');
  assert.equal(L.minToTime(570), '09:30');
  assert.equal(L.minToTime(1260), '21:00');
});
test('minToTime rejects bad input', () => {
  assert.equal(L.minToTime(-1), '');
  assert.equal(L.minToTime(1440), '');
  assert.equal(L.minToTime(NaN), '');
  assert.equal(L.minToTime('570'), '');
});
test('time round-trips', () => {
  for (const t of ['00:00', '07:15', '09:00', '12:45', '18:30', '21:00', '23:59']) {
    assert.equal(L.minToTime(L.timeToMin(t)), t, t);
  }
  for (let m = 0; m < 1440; m += 37) {
    assert.equal(L.timeToMin(L.minToTime(m)), m, String(m));
  }
});

// --- overlaps ---
test('overlaps: partial overlap', () => {
  assert.equal(L.overlaps(540, 630, 600, 700), true);
  assert.equal(L.overlaps(600, 700, 540, 630), true);
});
test('overlaps: containment', () => {
  assert.equal(L.overlaps(540, 700, 600, 630), true);
  assert.equal(L.overlaps(600, 630, 540, 700), true);
});
test('overlaps: end==start is NOT overlap', () => {
  assert.equal(L.overlaps(540, 600, 600, 660), false);
  assert.equal(L.overlaps(600, 660, 540, 600), false);
});
test('overlaps: disjoint', () => {
  assert.equal(L.overlaps(540, 600, 630, 700), false);
});
test('overlaps: identical range overlaps', () => {
  assert.equal(L.overlaps(540, 600, 540, 600), true);
});

// --- validateCourse ---
test('validateCourse accepts valid course', () => {
  assert.equal(L.validateCourse(course('CIS131', 'Data Structures', 'Dr. A', 'AB-204')), '');
  assert.equal(L.validateCourse(course('AB-1', 'X')), '');
});
test('validateCourse rejects bad code', () => {
  assert.notEqual(L.validateCourse(course('A', 'X')), '');
  assert.notEqual(L.validateCourse(course('TOOLONGCODE123', 'X')), '');
  assert.notEqual(L.validateCourse(course('BAD CODE', 'X')), '');
  assert.notEqual(L.validateCourse(course('', 'X')), '');
});
test('validateCourse rejects bad name/teacher/room/color', () => {
  assert.notEqual(L.validateCourse(course('CIS131', '')), '');
  assert.notEqual(L.validateCourse(course('CIS131', 'x'.repeat(81))), '');
  assert.notEqual(L.validateCourse(course('CIS131', 'X', 't'.repeat(61))), '');
  assert.notEqual(L.validateCourse(course('CIS131', 'X', '', 'r'.repeat(61))), '');
  assert.notEqual(L.validateCourse(course('CIS131', 'X', '', '', '#ffffff')), '');
  assert.notEqual(L.validateCourse(course('CIS131', 'X', '', '', 'red')), '');
});

// --- validateClassEntry ---
test('validateClassEntry accepts valid entry', () => {
  assert.equal(L.validateClassEntry(cls('1', 'CIS131', 'mon', '09:00', '10:30')), '');
  assert.equal(L.validateClassEntry(cls('1', 'CIS131', 'sat', '07:00', '21:00')), '');
});
test('validateClassEntry rejects Friday', () => {
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'fri', '09:00', '10:00')), '');
});
test('validateClassEntry rejects end<=start', () => {
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '10:00', '10:00')), '');
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '11:00', '10:00')), '');
});
test('validateClassEntry rejects out-of-window', () => {
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '06:30', '08:00')), '');
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '20:00', '21:30')), '');
});
test('validateClassEntry rejects bad time format', () => {
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '9:00', '10:00')), '');
  assert.notEqual(L.validateClassEntry(cls('1', 'CIS131', 'mon', '09:00', '25:00')), '');
});

// --- conflicts ---
test('conflict: same room overlap rejected', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204'), course('CIS132', 'Algo', 'Dr. B', 'AB-204')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  const conf = L.findConflicts(cls('2', 'CIS132', 'mon', '10:00', '11:00'), entries, courses);
  assert.equal(conf.length, 1);
  assert.equal(conf[0].reason, 'room');
});
test('conflict: same teacher overlap rejected (case-insensitive, trimmed)', () => {
  const courses = [course('CIS131', 'DS', '  Dr. A ', 'AB-204'), course('CIS132', 'Algo', 'dr. a', 'XY-101')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  const conf = L.findConflicts(cls('2', 'CIS132', 'mon', '10:00', '11:00'), entries, courses);
  assert.equal(conf.length, 1);
  assert.equal(conf[0].reason, 'teacher');
});
test('conflict: different room + teacher overlap allowed', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204'), course('CIS132', 'Algo', 'Dr. B', 'XY-101')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  assert.equal(L.findConflicts(cls('2', 'CIS132', 'mon', '10:00', '11:00'), entries, courses).length, 0);
});
test('conflict: same course overlap rejected', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  const conf = L.findConflicts(cls('2', 'CIS131', 'mon', '10:00', '11:00'), entries, courses);
  assert.equal(conf.length, 1);
  assert.equal(conf[0].reason, 'course');
});
test('conflict: same room different day allowed', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204'), course('CIS132', 'Algo', 'Dr. B', 'AB-204')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  assert.equal(L.findConflicts(cls('2', 'CIS132', 'tue', '09:00', '10:30'), entries, courses).length, 0);
});
test('conflict: back-to-back same room allowed (end==start)', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204'), course('CIS132', 'Algo', 'Dr. B', 'AB-204')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  assert.equal(L.findConflicts(cls('2', 'CIS132', 'mon', '10:30', '12:00'), entries, courses).length, 0);
});
test('conflict: empty room/teacher does not false-positive', () => {
  const courses = [course('CIS131', 'DS', '', ''), course('CIS132', 'Algo', '', '')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  assert.equal(L.findConflicts(cls('2', 'CIS132', 'mon', '10:00', '11:00'), entries, courses).length, 0);
});
test('conflict: edit skips self', () => {
  const courses = [course('CIS131', 'DS', 'Dr. A', 'AB-204')];
  const entries = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  assert.equal(L.findConflicts(cls('1', 'CIS131', 'mon', '09:00', '10:30'), entries, courses).length, 0);
});

// --- nowNext ---
test('nowNext: in-progress class', () => {
  const courses = [course('CIS131', 'DS')];
  const classes = [cls('1', 'CIS131', 'mon', '09:00', '10:30'), cls('2', 'CIS131', 'mon', '11:00', '12:00')];
  const r = L.nowNext(classes, courses, dateAt(2026, 10, 12, 9, 30));
  assert.equal(r.now && r.now.id, '1');
  assert.equal(r.minutesLeft, 60);
  assert.equal(r.next && r.next.id, '2');
  assert.equal(r.nextDayOffset, 0);
  assert.equal(r.minutesUntilNext, 90);
});
test('nowNext: next today when before first class', () => {
  const courses = [course('CIS131', 'DS')];
  const classes = [cls('1', 'CIS131', 'mon', '09:00', '10:30')];
  const r = L.nowNext(classes, courses, dateAt(2026, 10, 12, 8, 0));
  assert.equal(r.now, null);
  assert.equal(r.next && r.next.id, '1');
  assert.equal(r.minutesUntilNext, 60);
});
test('nowNext: wraps to next week', () => {
  const courses = [course('CIS131', 'DS')];
  const classes = [cls('1', 'CIS131', 'sat', '09:00', '10:00')];
  // Thursday 2026-10-15 18:00 -> next is Saturday 2026-10-17 09:00: Thu 18:00 -> Sat 09:00 = 2 days minus 9h = 39h = 2340 min
  const r = L.nowNext(classes, courses, dateAt(2026, 10, 15, 18, 0));
  assert.equal(r.next && r.next.id, '1');
  assert.equal(r.nextDayOffset, 2);
  assert.equal(r.minutesUntilNext, 2340);
});
test('nowNext: Friday shows no class today, next is Saturday', () => {
  const courses = [course('CIS131', 'DS')];
  const classes = [cls('1', 'CIS131', 'sat', '09:00', '10:00'), cls('2', 'CIS131', 'mon', '09:00', '10:00')];
  const r = L.nowNext(classes, courses, dateAt(2026, 10, 16, 10, 0)); // Friday
  assert.equal(r.now, null);
  assert.equal(r.next && r.next.id, '1');
  assert.equal(r.nextDayOffset, 1);
  assert.equal(r.minutesUntilNext, 1380);
});
test('nowNext: empty schedule', () => {
  const r = L.nowNext([], [], dateAt(2026, 10, 12, 9, 0));
  assert.equal(r.now, null);
  assert.equal(r.next, null);
});
test('nowNext: after last class today picks tomorrow', () => {
  const courses = [course('CIS131', 'DS')];
  const classes = [cls('1', 'CIS131', 'mon', '09:00', '10:00'), cls('2', 'CIS131', 'tue', '09:00', '10:00')];
  const r = L.nowNext(classes, courses, dateAt(2026, 10, 12, 11, 0));
  assert.equal(r.next && r.next.id, '2');
  assert.equal(r.nextDayOffset, 1);
});
test('nowNext: invalid date returns nulls', () => {
  const r = L.nowNext([], [], new Date('invalid'));
  assert.equal(r.now, null);
  assert.equal(r.next, null);
});
test('parseAsof parses valid, rejects bad', () => {
  const d = L.parseAsof('2026-10-12T09:30');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 12);
  assert.equal(d.getHours(), 9);
  assert.equal(L.parseAsof('2026-02-31T09:30'), null);
  assert.equal(L.parseAsof('not-a-date'), null);
  assert.equal(L.parseAsof(''), null);
  assert.equal(L.parseAsof(null), null);
});

// --- validateImport ---
function goodData() {
  return {
    app: 'class-routine-builder-bd', version: 1,
    courses: [course('CIS131', 'DS', 'Dr. A', 'AB-204'), course('CIS132', 'Algo', 'Dr. B', 'XY-101')],
    classes: [cls('1', 'CIS131', 'mon', '09:00', '10:30'), cls('2', 'CIS132', 'mon', '09:00', '10:30')]
  };
}
test('validateImport accepts good data (different room+teacher overlap is fine)', () => {
  assert.equal(L.validateImport(goodData()).ok, true);
  assert.equal(L.validateImport({ app: 'class-routine-builder-bd', version: 1, courses: [], classes: [] }).ok, true);
});
test('validateImport rejects wrong app id', () => {
  const d = goodData(); d.app = 'other-app';
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects wrong version', () => {
  const d = goodData(); d.version = 2;
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects non-object / arrays', () => {
  assert.equal(L.validateImport(null).ok, false);
  assert.equal(L.validateImport([]).ok, false);
  assert.equal(L.validateImport('x').ok, false);
});
test('validateImport rejects missing courses/classes arrays', () => {
  assert.equal(L.validateImport({ app: 'class-routine-builder-bd', version: 1, classes: [] }).ok, false);
  assert.equal(L.validateImport({ app: 'class-routine-builder-bd', version: 1, courses: [] }).ok, false);
});
test('validateImport rejects invalid course inside', () => {
  const d = goodData(); d.courses[0] = course('X', 'Y');
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects duplicate course codes', () => {
  const d = goodData(); d.courses.push(course('CIS131', 'Other'));
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects unknown course ref', () => {
  const d = goodData(); d.classes.push(cls('9', 'NOPE', 'tue', '09:00', '10:00'));
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects invalid times', () => {
  const d = goodData(); d.classes.push(cls('9', 'CIS131', 'tue', '11:00', '10:00'));
  assert.equal(L.validateImport(d).ok, false);
  const d2 = goodData(); d2.classes.push(cls('9', 'CIS131', 'tue', '06:00', '07:30'));
  assert.equal(L.validateImport(d2).ok, false);
});
test('validateImport rejects Friday class', () => {
  const d = goodData(); d.classes.push(cls('9', 'CIS131', 'fri', '09:00', '10:00'));
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects conflicting classes', () => {
  const d = goodData();
  d.classes.push(cls('9', 'CIS132', 'mon', '10:00', '11:00')); // same teacher? no - same room? CIS132 room XY-101 vs CIS131 AB-204, teacher Dr B vs Dr A -> no conflict; use same-room course
  // Replace: add a course sharing room with CIS131 and overlapping class
  d.courses.push(course('CIS133', 'OS', 'Dr. C', 'AB-204'));
  d.classes.push(cls('10', 'CIS133', 'mon', '10:00', '11:00'));
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport rejects duplicate class ids', () => {
  const d = goodData(); d.classes.push(cls('1', 'CIS132', 'tue', '09:00', '10:00'));
  assert.equal(L.validateImport(d).ok, false);
});
test('validateImport error names the first problem', () => {
  const d = goodData(); d.app = 'wrong'; d.version = 99;
  assert.match(L.validateImport(d).error, /app id/);
});

// --- Bengali digits ---
test('toBengaliDigits converts 0-9', () => {
  assert.equal(L.toBengaliDigits('0123456789'), '\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF');
  assert.equal(L.toBengaliDigits('09:30'), '\u09E6\u09EF:\u09E9\u09E6');
  assert.equal(L.toBengaliDigits('Room 204'), 'Room \u09E8\u09E6\u09EA');
});
test('toBengaliDigits leaves non-digits alone', () => {
  assert.equal(L.toBengaliDigits('abc-XYZ'), 'abc-XYZ');
  assert.equal(L.toBengaliDigits(''), '');
});
test('toEnglishDigits reverses conversion', () => {
  assert.equal(L.toEnglishDigits(L.toBengaliDigits('09:30')), '09:30');
});
test('formatMinutes honors BN', () => {
  assert.equal(L.formatMinutes(570, 'en'), '09:30');
  assert.equal(L.formatMinutes(570, 'bn'), '\u09E6\u09EF:\u09E9\u09E6');
});
test('formatCount honors BN', () => {
  assert.equal(L.formatCount(12, 'en'), '12');
  assert.equal(L.formatCount(12, 'bn'), '\u09E7\u09E8');
});
test('day names: 7 days, Sat first, Fri last', () => {
  assert.equal(L.DAYS.length, 7);
  assert.equal(L.DAYS[0].key, 'sat');
  assert.equal(L.DAYS[6].key, 'fri');
  assert.equal(L.CLASS_DAYS.length, 6);
  assert.equal(L.dayIndexFromJsDay(6), 0); // Saturday
  assert.equal(L.dayIndexFromJsDay(5), 6); // Friday
  assert.equal(L.dayIndexFromJsDay(1), 2); // Monday
});
test('sortEntries orders by day then start', () => {
  const sorted = L.sortEntries([
    cls('3', 'CIS131', 'tue', '09:00', '10:00'),
    cls('1', 'CIS131', 'mon', '11:00', '12:00'),
    cls('2', 'CIS131', 'mon', '09:00', '10:00')
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['2', '1', '3']);
});
