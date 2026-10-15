/* Headless-Chrome smoke tests via raw CDP (global WebSocket) + /opt/meta-chromium/chrome.
   Usage: node tests/smoke.mjs
   Pure ASCII. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHROME = '/opt/meta-chromium/chrome';
const PORT = 9222;
const INDEX = fileURLToPath(new URL('../index.html', import.meta.url));
const PROFILE = '/tmp/crb-smoke-profile';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('timeout waiting for ' + label);
}

async function main() {
  // Fresh profile so localStorage starts empty.
  const { rm } = await import('node:fs/promises');
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {});

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });

  let ws;
  let nextId = 1;
  const pending = new Map();
  const pageErrors = [];
  let networkHttpCount = 0;
  try {
    let version = null;
    await waitFor(async () => {
      try {
        const res = await fetch('http://127.0.0.1:' + PORT + '/json/version');
        if (res.ok) { version = await res.json(); return true; }
      } catch { /* not up yet */ }
      return false;
    }, 20000, 'chrome DevTools');
    const listRes = await fetch('http://127.0.0.1:' + PORT + '/json/list');
    const targets = await listRes.json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params && msg.params.type === 'error') {
          pageErrors.push('console.error: ' + JSON.stringify(msg.params.args || []));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails || {}).slice(0, 500));
        }
        if (msg.method === 'Log.entryAdded' && msg.params && msg.params.entry && msg.params.entry.level === 'error') {
          pageErrors.push('log.error: ' + (msg.params.entry.text || ''));
        }
        if (msg.method === 'Network.requestWillBeSent' && msg.params && msg.params.request) {
          const u = msg.params.request.url || '';
          if (/^https?:/i.test(u)) networkHttpCount++;
        }
        if (msg.method === 'Page.javascriptDialogOpening') {
          send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        }
      }
    };
    function send(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error('evaluate failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 800) + ' :: ' + expression.slice(0, 200));
      }
      return res.result ? res.result.value : undefined;
    }
    async function navigate(url) {
      await send('Page.navigate', { url });
      await waitFor(async () => (await evaluate('document.readyState')) === 'complete', 15000, 'page load ' + url);
      await sleep(400);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Log.enable', {});
    await send('Network.enable', {});
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    const baseUrl = 'file://' + INDEX;

    // 1. Load page.
    await navigate(baseUrl);
    check('page title mentions Class Routine', (await evaluate('document.title')).includes('Class Routine'));
    check('app heading renders', (await evaluate('document.getElementById("appTitle").textContent')).includes('Class Routine'));
    check('empty state shows (no classes)', await evaluate('!!document.getElementById("gridEmpty") && document.getElementById("gridEmpty").offsetParent !== null'));

    // 2. Add course CIS131.
    await evaluate(`(function(){ document.getElementById("courseCode").value="CIS131"; document.getElementById("courseName").value="Data Structures"; document.getElementById("courseTeacher").value="Dr. A"; document.getElementById("courseRoom").value="AB-204"; document.getElementById("courseForm").requestSubmit(); })()`);
    await waitFor(async () => (await evaluate('document.getElementById("courseList").textContent')).includes('CIS131'), 5000, 'course CIS131 in list');
    check('add course CIS131 appears in list', true);

    // 3. Invalid course rejected (code too short).
    await evaluate(`(function(){ document.getElementById("courseCode").value="X"; document.getElementById("courseName").value="Bad"; document.getElementById("courseForm").requestSubmit(); })()`);
    await sleep(300);
    check('invalid course code shows inline error', (await evaluate('document.getElementById("courseError").textContent')).length > 0);
    check('invalid course not added (still 1 course)', await evaluate('document.querySelectorAll("#courseList li").length') === 1);

    // 4. Add second course CIS132, same room AB-204, different teacher.
    await evaluate(`(function(){ document.getElementById("courseCode").value="CIS132"; document.getElementById("courseName").value="Algorithms"; document.getElementById("courseTeacher").value="Dr. B"; document.getElementById("courseRoom").value="AB-204"; document.getElementById("courseForm").requestSubmit(); })()`);
    await waitFor(async () => (await evaluate('document.querySelectorAll("#courseList li").length')) === 2, 5000, '2 courses');
    check('add course CIS132 (same room, different teacher)', true);

    // 5. Add class CIS131 Mon 09:00-10:30.
    await evaluate(`(function(){ document.getElementById("classCourse").value="CIS131"; document.getElementById("classDay").value="mon"; document.getElementById("classStart").value="09:00"; document.getElementById("classEnd").value="10:30"; document.getElementById("classForm").requestSubmit(); })()`);
    await waitFor(async () => (await evaluate('document.querySelectorAll(".class-block").length')) === 1, 5000, 'grid block 1');
    check('add class renders grid block', true);
    const topVal = await evaluate('parseFloat(document.querySelector(".class-block").style.top)');
    check('grid block top matches 09:00 (~14.29%)', Math.abs(topVal - 14.2857) < 0.6, 'top=' + topVal);
    const hVal = await evaluate('parseFloat(document.querySelector(".class-block").style.height)');
    check('grid block height matches 90 min (~10.71%)', Math.abs(hVal - 10.714) < 0.6, 'height=' + hVal);

    // 6. Conflict: CIS132 Mon 10:00-11:00 shares room AB-204 -> rejected, specific error.
    await evaluate(`(function(){ document.getElementById("classCourse").value="CIS132"; document.getElementById("classDay").value="mon"; document.getElementById("classStart").value="10:00"; document.getElementById("classEnd").value="11:00"; document.getElementById("classForm").requestSubmit(); })()`);
    await sleep(300);
    const conflictErr = await evaluate('document.getElementById("classError").textContent');
    check('conflict error shown naming conflicting class', /Conflict/i.test(conflictErr) && conflictErr.includes('CIS131'), conflictErr);
    check('conflicting class not added (still 1 block)', await evaluate('document.querySelectorAll(".class-block").length') === 1);

    // 7. Allowed overlap: CIS132 Tue 09:00-10:30 (different day, same room).
    await evaluate(`(function(){ document.getElementById("classCourse").value="CIS132"; document.getElementById("classDay").value="tue"; document.getElementById("classStart").value="09:00"; document.getElementById("classEnd").value="10:30"; document.getElementById("classForm").requestSubmit(); })()`);
    await waitFor(async () => (await evaluate('document.querySelectorAll(".class-block").length')) === 2, 5000, 'grid block 2');
    check('different-day overlap allowed (2 blocks)', true);

    // 8. Now & Next with ?asof= Monday 09:30 -> Now CIS131, Next CIS132 Tue.
    await navigate(baseUrl + '?asof=2026-10-12T09:30');
    check('now/next: Now shows in-progress CIS131 at Mon 09:30', (await evaluate('document.getElementById("nowLine").textContent')).includes('CIS131'));
    check('now/next: Next shows Tue CIS132', (await evaluate('document.getElementById("nextLine").textContent')).includes('CIS132'));
    check('asof preview badge shows', await evaluate('!document.getElementById("asofBadge").hidden'));

    // 9. Friday: no class today, next is Monday CIS131.
    await navigate(baseUrl + '?asof=2026-10-16T10:00');
    const friNow = await evaluate('document.getElementById("nowLine").textContent');
    const friNext = await evaluate('document.getElementById("nextLine").textContent');
    check('Friday: Now shows no class in progress', /No class/i.test(friNow), friNow);
    check('Friday: Next wraps to Monday CIS131', friNext.includes('CIS131'), friNext);

    // 10. Delete one class entry (auto-accepted confirm).
    await navigate(baseUrl);
    const beforeDel = await evaluate('document.querySelectorAll(".class-block").length');
    await evaluate(`(function(){ var b=document.querySelector('[data-action="delete-class"]'); if(b) b.click(); })()`);
    await waitFor(async () => (await evaluate('document.querySelectorAll(".class-block").length')) === beforeDel - 1, 5000, 'delete reduces blocks');
    check('delete entry removes grid block', true);

    // 11. Edit course name.
    await evaluate(`(function(){ var b=document.querySelector('[data-action="edit-course"]'); if(b) b.click(); })()`);
    await sleep(200);
    await evaluate(`(function(){ document.getElementById("courseName").value="Data Structures II"; document.getElementById("courseForm").requestSubmit(); })()`);
    await waitFor(async () => (await evaluate('document.getElementById("courseList").textContent')).includes('Data Structures II'), 5000, 'edited name');
    check('edit course updates name', true);

    // 12. BN toggle renders Bengali digits + persists after reload.
    await evaluate(`(function(){ document.getElementById("langBtn").click(); })()`);
    await sleep(300);
    const bnTitle = await evaluate('document.getElementById("appTitle").textContent');
    check('BN toggle renders Bengali title', /[\u0980-\u09FF]/.test(bnTitle), bnTitle);
    const bnStat = await evaluate('document.getElementById("statCourses").textContent');
    check('BN toggle renders Bengali digits in counts', /[\u09E6-\u09EF]/.test(bnStat), bnStat);
    await navigate(baseUrl);
    const bnTitleAfter = await evaluate('document.getElementById("appTitle").textContent');
    check('BN language persists after reload', /[\u0980-\u09FF]/.test(bnTitleAfter), bnTitleAfter);
    // Back to EN for remaining checks.
    await evaluate(`(function(){ document.getElementById("langBtn").click(); })()`);
    await sleep(300);

    // 13. Export -> erase -> import round-trip.
    const exported = await evaluate('window.__CRB.exportJSON()');
    check('export returns JSON with app id + courses', typeof exported === 'string' && exported.includes('class-routine-builder-bd') && exported.includes('CIS131'));
    await evaluate(`(function(){ document.getElementById("eraseInput").value="DELETE"; document.getElementById("eraseBtn").click(); })()`);
    await sleep(300);
    check('typed-DELETE erase clears data', await evaluate('document.querySelectorAll("#courseList li").length') === 0);
    const importRes = await evaluate('window.__CRB.importJSON(' + JSON.stringify(exported) + ')');
    check('import of exported JSON succeeds', importRes && importRes.ok === true, JSON.stringify(importRes));
    check('import restores courses', await evaluate('document.querySelectorAll("#courseList li").length') === 2);

    // 14. Malformed import rejected, data intact.
    const badRes = await evaluate('window.__CRB.importJSON(JSON.stringify({app:"wrong",version:1,courses:[],classes:[]}))');
    check('malformed import (wrong app) rejected', badRes && badRes.ok === false, JSON.stringify(badRes));
    check('data intact after rejected import', await evaluate('document.querySelectorAll("#courseList li").length') === 2);
    const badJson = await evaluate('window.__CRB.importJSON("{not json")');
    check('malformed import (invalid JSON) rejected', badJson && badJson.ok === false);

    // 15. Wrong typed-DELETE does not erase.
    await evaluate(`(function(){ document.getElementById("eraseInput").value="delete"; document.getElementById("eraseBtn").click(); })()`);
    await sleep(200);
    check('lowercase delete shows erase error, data intact',
      (await evaluate('document.getElementById("eraseError").textContent')).length > 0 &&
      (await evaluate('document.querySelectorAll("#courseList li").length')) === 2);

    // 16. Print button exists.
    check('print button exists', await evaluate('!!document.getElementById("printBtn")'));

    // 17. 390px: no horizontal overflow.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    const sw = await evaluate('document.scrollingElement.scrollWidth');
    check('390px no horizontal overflow (scrollWidth <= 391)', sw <= 391, 'scrollWidth=' + sw);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // 18. Zero network (http/https) requests + zero console/page errors.
    check('zero http(s) network requests', networkHttpCount === 0, 'count=' + networkHttpCount);
    check('zero console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    // 19. localStorage persistence across reload.
    await navigate(baseUrl);
    check('data persists across reload (localStorage)', await evaluate('document.querySelectorAll("#courseList li").length') === 2);
  } finally {
    if (ws) { try { ws.close(); } catch { /* ignore */ } }
    chrome.kill('SIGKILL');
  }

  console.log('\nSMOKE: ' + passed + ' passed, ' + failed + ' failed');
  if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log(' - ' + f)); }
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('SMOKE HARNESS ERROR:', e); process.exit(2); });
