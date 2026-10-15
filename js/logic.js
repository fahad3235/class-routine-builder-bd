/* class-routine-builder-bd - pure logic, no DOM.
   Works as a classic browser script (globalThis.CRBLogic) and as a
   Node module (module.exports) so tests can require it. Pure ASCII:
   Bengali text appears ONLY as \uXXXX escapes. */
(function (root) {
  'use strict';

  // Day index: 0=Sat, 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri.
  // jsDay is Date.getDay(): 0=Sun ... 6=Sat.
  var DAYS = [
    { key: 'sat', en: 'Saturday', bn: '\u09B6\u09A8\u09BF\u09AC\u09BE\u09B0', jsDay: 6 },
    { key: 'sun', en: 'Sunday', bn: '\u09B0\u09AC\u09BF\u09AC\u09BE\u09B0', jsDay: 0 },
    { key: 'mon', en: 'Monday', bn: '\u09B8\u09CB\u09AE\u09AC\u09BE\u09B0', jsDay: 1 },
    { key: 'tue', en: 'Tuesday', bn: '\u09AE\u0999\u09CD\u0997\u09B2\u09AC\u09BE\u09B0', jsDay: 2 },
    { key: 'wed', en: 'Wednesday', bn: '\u09AC\u09C1\u09A7\u09AC\u09BE\u09B0', jsDay: 3 },
    { key: 'thu', en: 'Thursday', bn: '\u09AC\u09C3\u09B9\u09B8\u09CD\u09AA\u09A4\u09BF\u09AC\u09BE\u09B0', jsDay: 4 },
    { key: 'fri', en: 'Friday', bn: '\u09B6\u09C1\u0995\u09CD\u09B0\u09AC\u09BE\u09B0', jsDay: 5 }
  ];
  var DAY_KEYS = DAYS.map(function (d) { return d.key; });
  var CLASS_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];
  var COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
  var DAY_START = 7 * 60; // 07:00
  var DAY_END = 21 * 60; // 21:00
  var APP_ID = 'class-routine-builder-bd';
  var DATA_VERSION = 1;

  function dayIndexFromJsDay(jsDay) {
    for (var i = 0; i < DAYS.length; i++) {
      if (DAYS[i].jsDay === jsDay) return i;
    }
    return -1;
  }

  function dayIndexFromKey(key) {
    return DAY_KEYS.indexOf(key);
  }

  function timeToMin(t) {
    if (typeof t !== 'string') return NaN;
    var m = /^(\d{2}):(\d{2})$/.exec(t);
    if (!m) return NaN;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
    return h * 60 + min;
  }

  function minToTime(min) {
    if (typeof min !== 'number' || isNaN(min) || min < 0 || min > 1439) return '';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }

  var BN_DIGITS = ['\u09E6', '\u09E7', '\u09E8', '\u09E9', '\u09EA', '\u09EB', '\u09EC', '\u09ED', '\u09EE', '\u09EF'];
  function toBengaliDigits(input) {
    return String(input).replace(/[0-9]/g, function (d) {
      return BN_DIGITS[parseInt(d, 10)];
    });
  }
  function toEnglishDigits(input) {
    return String(input).replace(/[\u09E6-\u09EF]/g, function (ch) {
      return String(BN_DIGITS.indexOf(ch));
    });
  }
  function formatMinutes(min, lang) {
    var t = minToTime(min);
    return lang === 'bn' ? toBengaliDigits(t) : t;
  }
  function formatCount(n, lang) {
    return lang === 'bn' ? toBengaliDigits(String(n)) : String(n);
  }

  function validateCourse(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 'Course must be an object.';
    if (typeof c.code !== 'string' || !/^[A-Za-z0-9-]{2,12}$/.test(c.code.trim())) {
      return 'Course code must be 2-12 characters (letters, digits, dash).';
    }
    if (typeof c.name !== 'string' || c.name.trim().length === 0 || c.name.trim().length > 80) {
      return 'Course name is required (max 80 characters).';
    }
    if (c.teacher != null && (typeof c.teacher !== 'string' || c.teacher.trim().length > 60)) {
      return 'Teacher must be at most 60 characters.';
    }
    if (c.room != null && (typeof c.room !== 'string' || c.room.trim().length > 60)) {
      return 'Room must be at most 60 characters.';
    }
    if (typeof c.color !== 'string' || COLORS.indexOf(c.color) === -1) {
      return 'Color must be one of the 6 preset colors.';
    }
    return '';
  }

  function validateClassEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return 'Class must be an object.';
    if (typeof e.courseCode !== 'string' || e.courseCode.trim() === '') {
      return 'Class must reference a course.';
    }
    if (CLASS_DAYS.indexOf(e.day) === -1) {
      return 'Day must be Saturday to Thursday.';
    }
    var s = timeToMin(e.start);
    var en = timeToMin(e.end);
    if (isNaN(s) || isNaN(en)) return 'Start and end must be HH:MM times.';
    if (en <= s) return 'End time must be after start time.';
    if (s < DAY_START || en > DAY_END) return 'Classes must be within 07:00-21:00.';
    return '';
  }

  function courseByCode(courses, code) {
    for (var i = 0; i < courses.length; i++) {
      if (courses[i].code === code) return courses[i];
    }
    return null;
  }

  // Find conflicts of candidate against entries. Candidate and entries have
  // {courseCode, day, start, end, id?}. Same id is skipped (edit case).
  // Returns [{entry, course, reason}] with reason 'course' | 'room' | 'teacher'.
  function findConflicts(candidate, entries, courses) {
    var out = [];
    var cStart = timeToMin(candidate.start);
    var cEnd = timeToMin(candidate.end);
    if (isNaN(cStart) || isNaN(cEnd)) return out;
    var cCourse = courseByCode(courses, candidate.courseCode);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (candidate.id != null && e.id === candidate.id) continue;
      if (e.day !== candidate.day) continue;
      if (!overlaps(cStart, cEnd, timeToMin(e.start), timeToMin(e.end))) continue;
      var eCourse = courseByCode(courses, e.courseCode);
      if (e.courseCode === candidate.courseCode) {
        out.push({ entry: e, course: eCourse, reason: 'course' });
        continue;
      }
      var roomHit = cCourse && eCourse && norm(cCourse.room) !== '' &&
        norm(cCourse.room) === norm(eCourse.room);
      var teacherHit = cCourse && eCourse && norm(cCourse.teacher) !== '' &&
        norm(cCourse.teacher) === norm(eCourse.teacher);
      if (roomHit) out.push({ entry: e, course: eCourse, reason: 'room' });
      else if (teacherHit) out.push({ entry: e, course: eCourse, reason: 'teacher' });
    }
    return out;
  }

  function describeConflict(conflict, lang) {
    var c = conflict.course;
    var label = c ? c.code + ' ' + c.name : conflict.entry.courseCode;
    if (conflict.reason === 'course') {
      return lang === 'bn'
        ? '\u098F\u0995\u0987 \u0995\u09CB\u09B0\u09CD\u09B8\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \u0993\u09AD\u09BE\u09B0\u09B2\u09CD\u09AF\u09BE\u09AA: ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')'
        : 'Overlaps the same course: ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')';
    }
    if (conflict.reason === 'room') {
      return lang === 'bn'
        ? '\u09B0\u09C1\u09AE \u09B8\u0982\u0998\u09B0\u09CD\u09B7: ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')'
        : 'Room conflict with ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')';
    }
    return lang === 'bn'
      ? '\u09B6\u09BF\u0995\u09CD\u09B7\u0995 \u09B8\u0982\u0998\u09B0\u09CD\u09B7: ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')'
      : 'Teacher conflict with ' + label + ' (' + conflict.entry.start + '-' + conflict.entry.end + ')';
  }

  function sortEntries(entries) {
    return entries.slice().sort(function (a, b) {
      var d = dayIndexFromKey(a.day) - dayIndexFromKey(b.day);
      if (d !== 0) return d;
      return timeToMin(a.start) - timeToMin(b.start);
    });
  }

  // nowNext(classes, courses, nowDate) -> {now, next, nextDayOffset,
  // minutesUntilNext, minutesLeft}. now/next are class entries (or null).
  function nowNext(classes, courses, nowDate) {
    var result = { now: null, next: null, nextDayOffset: null, minutesUntilNext: null, minutesLeft: null };
    if (!(nowDate instanceof Date) || isNaN(nowDate.getTime())) return result;
    var todayIdx = dayIndexFromJsDay(nowDate.getDay());
    var nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    var byDay = function (idx) {
      return classes.filter(function (e) { return dayIndexFromKey(e.day) === idx; })
        .sort(function (a, b) { return timeToMin(a.start) - timeToMin(b.start); });
    };
    var today = byDay(todayIdx);
    for (var i = 0; i < today.length; i++) {
      var s = timeToMin(today[i].start);
      var e = timeToMin(today[i].end);
      if (s <= nowMin && nowMin < e) {
        result.now = today[i];
        result.minutesLeft = e - nowMin;
        break;
      }
    }
    var nextToday = null;
    for (var j = 0; j < today.length; j++) {
      if (timeToMin(today[j].start) > nowMin) { nextToday = today[j]; break; }
    }
    if (nextToday) {
      result.next = nextToday;
      result.nextDayOffset = 0;
      result.minutesUntilNext = timeToMin(nextToday.start) - nowMin;
      return result;
    }
    for (var off = 1; off <= 7; off++) {
      var dayList = byDay((todayIdx + off) % 7);
      if (dayList.length > 0) {
        result.next = dayList[0];
        result.nextDayOffset = off;
        result.minutesUntilNext = (1440 - nowMin) + (off - 1) * 1440 + timeToMin(dayList[0].start);
        return result;
      }
    }
    return result;
  }

  function parseAsof(value) {
    if (typeof value !== 'string' || value === '') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!m) return null;
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
      parseInt(m[4], 10), parseInt(m[5], 10), 0, 0);
    if (isNaN(d.getTime())) return null;
    // Reject overflow dates like 2026-02-31 (JS rolls over).
    if (d.getFullYear() !== parseInt(m[1], 10) || d.getMonth() !== parseInt(m[2], 10) - 1 ||
        d.getDate() !== parseInt(m[3], 10)) return null;
    return d;
  }

  // Strict import validation. Returns {ok:true} or {ok:false, error}.
  function validateImport(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'File must contain a JSON object.' };
    }
    if (data.app !== APP_ID) {
      return { ok: false, error: 'Wrong app id: expected "' + APP_ID + '".' };
    }
    if (data.version !== DATA_VERSION) {
      return { ok: false, error: 'Unsupported version: expected 1.' };
    }
    if (!Array.isArray(data.courses)) return { ok: false, error: 'courses must be an array.' };
    if (!Array.isArray(data.classes)) return { ok: false, error: 'classes must be an array.' };
    var seenCodes = {};
    for (var i = 0; i < data.courses.length; i++) {
      var err = validateCourse(data.courses[i]);
      if (err) return { ok: false, error: 'Course #' + (i + 1) + ': ' + err };
      var code = data.courses[i].code.trim();
      if (seenCodes[code]) return { ok: false, error: 'Duplicate course code: ' + code + '.' };
      seenCodes[code] = true;
    }
    var seenIds = {};
    for (var j = 0; j < data.classes.length; j++) {
      var cl = data.classes[j];
      var cerr = validateClassEntry(cl);
      if (cerr) return { ok: false, error: 'Class #' + (j + 1) + ': ' + cerr };
      if (!courseByCode(data.courses, cl.courseCode)) {
        return { ok: false, error: 'Class #' + (j + 1) + ': unknown course "' + cl.courseCode + '".' };
      }
      if (cl.id != null) {
        if (seenIds[cl.id]) return { ok: false, error: 'Class #' + (j + 1) + ': duplicate id.' };
        seenIds[cl.id] = true;
      }
      var conflicts = findConflicts(cl, data.classes.slice(0, j), data.courses);
      if (conflicts.length > 0) {
        return { ok: false, error: 'Class #' + (j + 1) + ': conflicts with an earlier class (' + describeConflict(conflicts[0], 'en') + ').' };
      }
    }
    return { ok: true };
  }

  function formatDuration(mins, lang) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var out;
    if (h > 0 && m > 0) out = h + 'h ' + m + 'm';
    else if (h > 0) out = h + 'h';
    else out = m + ' min';
    return lang === 'bn' ? toBengaliDigits(out) : out;
  }

  var api = {
    DAYS: DAYS, DAY_KEYS: DAY_KEYS, CLASS_DAYS: CLASS_DAYS, COLORS: COLORS,
    DAY_START: DAY_START, DAY_END: DAY_END, APP_ID: APP_ID, DATA_VERSION: DATA_VERSION,
    dayIndexFromJsDay: dayIndexFromJsDay, dayIndexFromKey: dayIndexFromKey,
    timeToMin: timeToMin, minToTime: minToTime, overlaps: overlaps, norm: norm,
    toBengaliDigits: toBengaliDigits, toEnglishDigits: toEnglishDigits,
    formatMinutes: formatMinutes, formatCount: formatCount, formatDuration: formatDuration,
    validateCourse: validateCourse, validateClassEntry: validateClassEntry,
    courseByCode: courseByCode, findConflicts: findConflicts,
    describeConflict: describeConflict, sortEntries: sortEntries,
    nowNext: nowNext, parseAsof: parseAsof, validateImport: validateImport
  };
  root.CRBLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
