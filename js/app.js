/* class-routine-builder-bd - DOM layer. Pure ASCII. Uses CRBLogic + CRBI18n globals. */
(function () {
  'use strict';
  var L = window.CRBLogic;
  var I18N = window.CRBI18n;
  var LS_DATA = 'crb-data-v1';
  var LS_LANG = 'crb-lang';

  var state = { courses: [], classes: [] };
  var lang = 'en';
  var editingCourseCode = null;
  var editingClassId = null;

  function $(id) { return document.getElementById(id); }
  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(min) { return L.formatMinutes(min, lang); }
  function fmtTimeStr(hhmm) { var m = L.timeToMin(hhmm); return isNaN(m) ? hhmm : fmtTime(m); }
  function fmtCount(n) { return L.formatCount(n, lang); }
  function dayName(key) {
    for (var i = 0; i < L.DAYS.length; i++) {
      if (L.DAYS[i].key === key) return lang === 'bn' ? L.DAYS[i].bn : L.DAYS[i].en;
    }
    return key;
  }
  function classLabel(entry) {
    var c = L.courseByCode(state.courses, entry.courseCode);
    var name = c ? c.name : t('unknownCourse');
    return (c ? c.code + ' ' : entry.courseCode + ' ') + name;
  }
  function classDetail(entry) {
    var c = L.courseByCode(state.courses, entry.courseCode);
    var parts = [];
    if (c && c.teacher) parts.push(c.teacher);
    if (c && c.room) parts.push(c.room);
    return parts.join(' | ');
  }

  function save() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(LS_DATA);
      if (raw) {
        var parsed = JSON.parse(raw);
        var check = L.validateImport({ app: L.APP_ID, version: L.DATA_VERSION, courses: parsed.courses || [], classes: parsed.classes || [] });
        if (check.ok) state = { courses: parsed.courses, classes: parsed.classes };
      }
    } catch (e) { state = { courses: [], classes: [] }; }
    try {
      var l = localStorage.getItem(LS_LANG);
      if (l === 'bn' || l === 'en') lang = l;
    } catch (e) { /* ignore */ }
  }
  function setLang(next) {
    lang = next;
    try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    renderAll();
  }

  function getAsof() {
    var params = new URLSearchParams(window.location.search);
    return L.parseAsof(params.get('asof') || '');
  }

  function renderStaticText() {
    var map = {
      appTitle: 'appTitle', appSubtitle: 'appSubtitle', nowTitle: 'nowTitle',
      coursesTitle: 'coursesTitle', classesTitle: 'classesTitle', gridTitle: 'gridTitle',
      gridHint: 'gridHint', gridEmpty: 'gridEmpty', dataTitle: 'dataTitle',
      importLabel: 'importLabel', eraseTitle: 'eraseTitle', eraseHint: 'eraseHint',
      footerText: 'footer', courseCodeLabel: 'courseCode', courseNameLabel: 'courseName',
      courseTeacherLabel: 'teacher', courseRoomLabel: 'room', courseColorLabel: 'color',
      courseCodeHint: 'courseCodeHint', classCourseLabel: 'course', classDayLabel: 'day',
      classStartLabel: 'startTime', classEndLabel: 'endTime', noCourses: 'noCourses',
      noClasses: 'noClasses', statCoursesLabel: 'totalCourses', statClassesLabel: 'totalClasses',
      nowKicker: 'nowLabel', nextKicker: 'nextLabel'
    };
    Object.keys(map).forEach(function (id) { var el = $(id); if (el) el.textContent = t(map[id]); });
    $('langBtn').textContent = t('langButton');
    $('langBtn').setAttribute('aria-label', t('langLabel'));
    $('printBtn').textContent = t('printButton');
    $('courseSubmit').textContent = editingCourseCode ? t('saveCourse') : t('addCourse');
    $('classSubmit').textContent = editingClassId ? t('saveClass') : t('addClass');
    $('exportBtn').textContent = t('exportBtn');
    $('eraseBtn').textContent = t('eraseBtn');
    $('eraseInput').placeholder = t('erasePlaceholder');
    $('courseCancel').textContent = t('cancelEdit');
    $('classCancel').textContent = t('cancelEdit');
    $('printTitle').textContent = t('appTitle') + ' - ' + t('gridTitle');
  }

  function renderStats() {
    $('statCourses').textContent = fmtCount(state.courses.length);
    $('statClasses').textContent = fmtCount(state.classes.length);
  }

  function renderCourseFormOptions() {
    var sel = $('courseColor');
    sel.innerHTML = '';
    L.COLORS.forEach(function (c, i) {
      var o = document.createElement('option');
      o.value = c; o.textContent = 'Color ' + (i + 1) + ' ' + c;
      sel.appendChild(o);
    });
    var cc = $('classCourse');
    cc.innerHTML = '';
    if (state.courses.length === 0) {
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = t('selectCourseFirst');
      cc.appendChild(ph);
    } else {
      state.courses.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.code; o.textContent = c.code + ' - ' + c.name;
        cc.appendChild(o);
      });
    }
    var daySel = $('classDay');
    daySel.innerHTML = '';
    L.CLASS_DAYS.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = dayName(k);
      daySel.appendChild(o);
    });
  }

  function renderCourseList() {
    var ul = $('courseList');
    ul.innerHTML = '';
    $('noCourses').style.display = state.courses.length ? 'none' : '';
    state.courses.forEach(function (c) {
      var li = document.createElement('li');
      var used = state.classes.filter(function (e) { return e.courseCode === c.code; }).length;
      var left = document.createElement('div');
      left.innerHTML = '<span class="swatch" style="background:' + esc(c.color) + '"></span> <strong>' + esc(c.code) + '</strong> ' + esc(c.name) +
        '<div class="item-meta">' + esc([c.teacher, c.room].filter(Boolean).join(' | ')) + (used ? ' | ' + fmtCount(used) + ' ' + t('totalClasses').toLowerCase() : '') + '</div>';
      var actions = document.createElement('div');
      actions.className = 'item-actions';
      var editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.className = 'secondary'; editBtn.textContent = t('edit');
      editBtn.setAttribute('data-action', 'edit-course'); editBtn.setAttribute('data-code', c.code);
      var delBtn = document.createElement('button');
      delBtn.type = 'button'; delBtn.className = 'secondary'; delBtn.textContent = t('delete');
      delBtn.setAttribute('data-action', 'delete-course'); delBtn.setAttribute('data-code', c.code);
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      li.appendChild(left); li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function renderClassList() {
    var wrap = $('classList');
    wrap.innerHTML = '';
    $('noClasses').style.display = state.classes.length ? 'none' : '';
    L.CLASS_DAYS.forEach(function (dayKey) {
      var dayEntries = state.classes.filter(function (e) { return e.day === dayKey; })
        .sort(function (a, b) { return L.timeToMin(a.start) - L.timeToMin(b.start); });
      if (!dayEntries.length) return;
      var g = document.createElement('div');
      g.className = 'day-group';
      var h = document.createElement('h3');
      h.textContent = dayName(dayKey);
      g.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'list';
      dayEntries.forEach(function (e) {
        var li = document.createElement('li');
        var left = document.createElement('div');
        left.innerHTML = '<strong>' + esc(classLabel(e)) + '</strong> <span>' + esc(fmtTimeStr(e.start)) + ' - ' + esc(fmtTimeStr(e.end)) + '</span>' +
          '<div class="item-meta">' + esc(classDetail(e)) + '</div>';
        var actions = document.createElement('div');
        actions.className = 'item-actions';
        var editBtn = document.createElement('button');
        editBtn.type = 'button'; editBtn.className = 'secondary'; editBtn.textContent = t('edit');
        editBtn.setAttribute('data-action', 'edit-class'); editBtn.setAttribute('data-id', e.id);
        var delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'secondary'; delBtn.textContent = t('delete');
        delBtn.setAttribute('data-action', 'delete-class'); delBtn.setAttribute('data-id', e.id);
        actions.appendChild(editBtn); actions.appendChild(delBtn);
        li.appendChild(left); li.appendChild(actions);
        ul.appendChild(li);
      });
      g.appendChild(ul);
      wrap.appendChild(g);
    });
  }

  function renderGrid() {
    var head = $('gridHead');
    var body = $('gridBody');
    head.innerHTML = '';
    body.innerHTML = '';
    $('gridEmpty').style.display = state.classes.length ? 'none' : '';
    var corner = document.createElement('div');
    corner.className = 'corner'; corner.textContent = '';
    head.appendChild(corner);
    L.CLASS_DAYS.forEach(function (k) {
      var d = document.createElement('div');
      d.className = 'day-head'; d.textContent = dayName(k);
      head.appendChild(d);
    });
    var timeCol = document.createElement('div');
    timeCol.className = 'time-col';
    for (var h = 7; h <= 21; h++) {
      var lbl = document.createElement('div');
      lbl.className = 'time-label';
      lbl.style.top = ((h * 60 - L.DAY_START) / (L.DAY_END - L.DAY_START) * 100) + '%';
      lbl.textContent = fmtTime(h * 60);
      timeCol.appendChild(lbl);
    }
    body.appendChild(timeCol);
    L.CLASS_DAYS.forEach(function (dayKey) {
      var col = document.createElement('div');
      col.className = 'day-col';
      col.setAttribute('data-day', dayKey);
      for (var hh = 7; hh <= 21; hh++) {
        var line = document.createElement('div');
        line.className = 'hour-line';
        line.style.top = ((hh * 60 - L.DAY_START) / (L.DAY_END - L.DAY_START) * 100) + '%';
        col.appendChild(line);
      }
      state.classes.filter(function (e) { return e.day === dayKey; }).forEach(function (e) {
        var c = L.courseByCode(state.courses, e.courseCode);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'class-block';
        btn.setAttribute('data-action', 'delete-class');
        btn.setAttribute('data-id', e.id);
        btn.title = classLabel(e);
        var top = (L.timeToMin(e.start) - L.DAY_START) / (L.DAY_END - L.DAY_START) * 100;
        var height = (L.timeToMin(e.end) - L.timeToMin(e.start)) / (L.DAY_END - L.DAY_START) * 100;
        btn.style.top = top + '%';
        btn.style.height = Math.max(height, 4) + '%';
        btn.style.background = c ? c.color : '#6b7280';
        btn.innerHTML = '<span class="cb-code">' + esc(c ? c.code : e.courseCode) + '</span><br>' +
          '<span class="cb-time">' + esc(fmtTimeStr(e.start)) + ' - ' + esc(fmtTimeStr(e.end)) + '</span><br>' +
          (c && c.room ? '<span>' + esc(c.room) + '</span>' : '');
        col.appendChild(btn);
      });
      body.appendChild(col);
    });
  }

  function renderNowNext() {
    var asof = getAsof();
    var now = asof || new Date();
    var res = L.nowNext(state.classes, state.courses, now);
    var badge = $('asofBadge');
    if (asof) {
      badge.hidden = false;
      badge.textContent = t('previewAsOf') + ' ' + asof.getFullYear() + '-' +
        String(asof.getMonth() + 1).padStart(2, '0') + '-' + String(asof.getDate()).padStart(2, '0') + ' ' +
        String(asof.getHours()).padStart(2, '0') + ':' + String(asof.getMinutes()).padStart(2, '0');
    } else badge.hidden = true;
    if (res.now) {
      $('nowLine').textContent = classLabel(res.now);
      $('nowSub').textContent = fmtTimeStr(res.now.start) + ' - ' + fmtTimeStr(res.now.end) + ' | ' +
        fmtCount(res.minutesLeft) + ' ' + t('minLeft') + (classDetail(res.now) ? ' | ' + classDetail(res.now) : '');
    } else {
      $('nowLine').textContent = t('noClassNow');
      var todayIdx = L.dayIndexFromJsDay(now.getDay());
      $('nowSub').textContent = todayIdx === 6 ? t('noClassToday') : '';
    }
    if (res.next) {
      var prefix = '';
      if (res.nextDayOffset > 0) prefix = dayName(L.DAY_KEYS[(L.dayIndexFromJsDay(now.getDay()) + res.nextDayOffset) % 7]) + ' - ';
      $('nextLine').textContent = prefix + classLabel(res.next);
      var mins = res.minutesUntilNext;
      var durText;
      if (mins < 60) durText = fmtCount(mins) + ' min';
      else if (mins < 1440) durText = fmtCount(Math.floor(mins / 60)) + 'h ' + fmtCount(mins % 60) + 'm';
      else durText = fmtCount(Math.floor(mins / 1440)) + 'd ' + fmtCount(Math.floor((mins % 1440) / 60)) + 'h';
      $('nextSub').textContent = fmtTimeStr(res.next.start) + ' - ' + fmtTimeStr(res.next.end) + ' | ' +
        t('startsIn') + ' ' + durText + (classDetail(res.next) ? ' | ' + classDetail(res.next) : '');
    } else {
      $('nextLine').textContent = t('noClassNext');
      $('nextSub').textContent = '';
    }
  }

  function renderAll() {
    renderStaticText();
    renderCourseFormOptions();
    renderCourseList();
    renderClassList();
    renderGrid();
    renderNowNext();
    renderStats();
  }

  function showMsg(elId, msg) { $(elId).textContent = msg || ''; }
  function newId() { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function onCourseSubmit(ev) {
    ev.preventDefault();
    showMsg('courseError', ''); showMsg('courseMsg', '');
    var code = $('courseCode').value.trim();
    var candidate = {
      code: code,
      name: $('courseName').value.trim(),
      teacher: $('courseTeacher').value.trim(),
      room: $('courseRoom').value.trim(),
      color: $('courseColor').value
    };
    var err = L.validateCourse(candidate);
    if (err) { showMsg('courseError', err); return; }
    if (editingCourseCode) {
      if (code !== editingCourseCode && L.courseByCode(state.courses, code)) {
        showMsg('courseError', 'Course code already exists: ' + code + '.'); return;
      }
      var idx = -1;
      for (var i = 0; i < state.courses.length; i++) if (state.courses[i].code === editingCourseCode) idx = i;
      if (idx === -1) { showMsg('courseError', 'Course not found.'); return; }
      var oldCode = state.courses[idx].code;
      state.courses[idx] = candidate;
      if (code !== oldCode) {
        state.classes.forEach(function (e) { if (e.courseCode === oldCode) e.courseCode = code; });
      }
      showMsg('courseMsg', t('courseUpdated'));
      cancelCourseEdit();
    } else {
      if (L.courseByCode(state.courses, code)) {
        showMsg('courseError', 'Course code already exists: ' + code + '.'); return;
      }
      state.courses.push(candidate);
      showMsg('courseMsg', t('courseAdded'));
      $('courseForm').reset();
    }
    save(); renderAll();
  }
  function cancelCourseEdit() {
    editingCourseCode = null;
    $('courseCancel').hidden = true;
    $('courseForm').reset();
    renderStaticText();
  }

  function onClassSubmit(ev) {
    ev.preventDefault();
    showMsg('classError', ''); showMsg('classMsg', '');
    var candidate = {
      id: editingClassId || newId(),
      courseCode: $('classCourse').value,
      day: $('classDay').value,
      start: $('classStart').value,
      end: $('classEnd').value
    };
    var err = L.validateClassEntry(candidate);
    if (err) { showMsg('classError', err); return; }
    if (!L.courseByCode(state.courses, candidate.courseCode)) {
      showMsg('classError', t('selectCourseFirst')); return;
    }
    var conflicts = L.findConflicts(candidate, state.classes, state.courses);
    if (conflicts.length > 0) {
      showMsg('classError', t('conflictPrefix') + L.describeConflict(conflicts[0], lang));
      return;
    }
    if (editingClassId) {
      var idx = -1;
      for (var i = 0; i < state.classes.length; i++) if (state.classes[i].id === editingClassId) idx = i;
      if (idx === -1) { showMsg('classError', 'Class not found.'); return; }
      state.classes[idx] = candidate;
      showMsg('classMsg', t('classUpdated'));
      cancelClassEdit();
    } else {
      state.classes.push(candidate);
      showMsg('classMsg', t('classAdded'));
      $('classForm').reset();
      $('classStart').value = '09:00'; $('classEnd').value = '10:30';
    }
    save(); renderAll();
  }
  function cancelClassEdit() {
    editingClassId = null;
    $('classCancel').hidden = true;
    $('classForm').reset();
    $('classStart').value = '09:00'; $('classEnd').value = '10:30';
    renderStaticText();
  }

  function deleteCourse(code) {
    showMsg('courseError', ''); showMsg('courseMsg', '');
    var used = state.classes.filter(function (e) { return e.courseCode === code; });
    if (used.length > 0) { showMsg('courseError', t('courseInUse')); return; }
    if (!window.confirm(t('confirmDeleteCourse'))) return;
    state.courses = state.courses.filter(function (c) { return c.code !== code; });
    if (editingCourseCode === code) cancelCourseEdit();
    save(); renderAll();
    showMsg('courseMsg', t('courseDeleted'));
  }
  function deleteClass(id) {
    showMsg('classError', ''); showMsg('classMsg', '');
    if (!window.confirm(t('confirmDeleteClass'))) return;
    state.classes = state.classes.filter(function (e) { return e.id !== id; });
    if (editingClassId === id) cancelClassEdit();
    save(); renderAll();
    showMsg('classMsg', t('classDeleted'));
  }

  function exportJSON() {
    var payload = { app: L.APP_ID, version: L.DATA_VERSION, courses: state.courses, classes: state.classes };
    return JSON.stringify(payload, null, 2);
  }
  function importJSON(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'Invalid JSON: ' + e.message }; }
    var check = L.validateImport(parsed);
    if (!check.ok) return check;
    state = { courses: parsed.courses, classes: parsed.classes };
    save(); renderAll();
    return { ok: true };
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'delete-course') deleteCourse(btn.getAttribute('data-code'));
    else if (action === 'delete-class') deleteClass(btn.getAttribute('data-id'));
    else if (action === 'edit-course') {
      var c = L.courseByCode(state.courses, btn.getAttribute('data-code'));
      if (!c) return;
      editingCourseCode = c.code;
      $('courseCode').value = c.code; $('courseName').value = c.name;
      $('courseTeacher').value = c.teacher || ''; $('courseRoom').value = c.room || '';
      $('courseColor').value = c.color;
      $('courseCancel').hidden = false;
      renderStaticText();
      $('courseCode').focus();
    } else if (action === 'edit-class') {
      var found = null;
      for (var i = 0; i < state.classes.length; i++) if (state.classes[i].id === btn.getAttribute('data-id')) found = state.classes[i];
      if (!found) return;
      editingClassId = found.id;
      $('classCourse').value = found.courseCode; $('classDay').value = found.day;
      $('classStart').value = found.start; $('classEnd').value = found.end;
      $('classCancel').hidden = false;
      renderStaticText();
      $('classCourse').focus();
    }
  });

  $('courseForm').addEventListener('submit', onCourseSubmit);
  $('courseCancel').addEventListener('click', function () { cancelCourseEdit(); renderAll(); });
  $('classForm').addEventListener('submit', onClassSubmit);
  $('classCancel').addEventListener('click', function () { cancelClassEdit(); renderAll(); });
  $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'bn' : 'en'); });
  $('printBtn').addEventListener('click', function () { window.print(); });
  $('exportBtn').addEventListener('click', function () {
    showMsg('dataError', ''); showMsg('dataMsg', '');
    try {
      var blob = new Blob([exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'class-routine-builder-bd.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      showMsg('dataMsg', t('exported'));
    } catch (e) { showMsg('dataError', String(e)); }
  });
  $('importFile').addEventListener('change', function () {
    showMsg('dataError', ''); showMsg('dataMsg', '');
    var file = $('importFile').files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = importJSON(String(reader.result));
      if (res.ok) showMsg('dataMsg', t('imported'));
      else showMsg('dataError', t('importErrorPrefix') + res.error);
      $('importFile').value = '';
    };
    reader.onerror = function () { showMsg('dataError', t('importErrorPrefix') + 'Could not read file.'); };
    reader.readAsText(file);
  });
  $('eraseBtn').addEventListener('click', function () {
    showMsg('eraseError', ''); showMsg('dataMsg', '');
    if ($('eraseInput').value !== 'DELETE') { showMsg('eraseError', t('eraseWrong')); return; }
    state = { courses: [], classes: [] };
    editingCourseCode = null; editingClassId = null;
    $('eraseInput').value = '';
    save(); renderAll();
    showMsg('dataMsg', t('erased'));
  });

  // Test hooks for headless smoke tests (same-origin only, no network).
  window.__CRB = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    setState: function (s) { state = { courses: s.courses || [], classes: s.classes || [] }; save(); renderAll(); },
    importJSON: importJSON,
    exportJSON: exportJSON,
    getLang: function () { return lang; },
    setLang: setLang,
    renderAll: renderAll
  };

  load();
  renderAll();
})();
