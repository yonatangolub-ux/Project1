// הממשק. כל החישובים של זמנים וייבוא נמצאים ב-core.js (עם בדיקות).
import * as db from './db.js';
import {
  splitTransitions, formatLocal, statusText, parseImport,
  withOffset, toLocalInputValue, offsetMinutesOf, offsetString, docNamesFromText,
  ZOOM, zoomScroll, isDoubleTap,
} from './core.js';

const $ = (sel) => document.querySelector(sel);

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== '') e.append(kid);
  return e;
}

let state = { transitions: [], docNames: new Set(), pinned: [] };

async function load() {
  try {
    const [transitions, names, pinned] = await Promise.all([db.getAll('transitions'), db.keys('docs'), db.getPinned()]);
    state = { transitions, docNames: new Set(names), pinned };
    render();
  } catch (e) {
    $('#next').replaceChildren(h('article', { class: 'card' }, h('p', { class: 'error' }, `שגיאה בטעינת המידע: ${e.message}`)));
  }
}

// ---------- המסך ----------

function render() {
  const now = Date.now();
  const { arrived, next, later } = splitTransitions(state.transitions, now);

  // מה שנחת ב-6 השעות האחרונות נשאר למעלה, עם ההערות של "מה לעשות כשמגיעים"
  $('#arrived').replaceChildren(...(arrived ? [h('h2', { class: 'label' }, 'הגעת'), card(arrived, now)] : []));

  $('#next').replaceChildren(
    h('h2', { class: 'label' }, 'המעבר הבא'),
    next ? card(next, now) : h('article', { class: 'card empty' },
      h('p', {}, 'אין מעברים קרובים.'),
      h('p', { class: 'muted' }, 'לוחצים "ייבוא" כדי להדביק קוד מ-Claude, או "+ מעבר" כדי להוסיף לבד.')),
  );

  $('#pinned').replaceChildren(
    h('h2', { class: 'label' }, 'תמיד בהישג יד'),
    h('div', { class: 'docs' },
      state.pinned.map(docButton),
      h('button', { type: 'button', class: 'doc add', onclick: () => openDocDialog({ kind: 'pinned' }) }, '+ מסמך קבוע')),
  );

  $('#later').replaceChildren(...(later.length ? [
    h('h2', { class: 'label' }, 'אחר כך'),
    ...later.map((t) => h('details', { class: 'later' },
      h('summary', {}, h('span', { class: 'later-title' }, t.title), h('span', { class: 'later-when' }, formatLocal(t.start))),
      card(t, now))),
  ] : []));
}

function card(t, now) {
  return h('article', { class: 'card' },
    h('h1', {}, t.title),
    h('p', { class: 'when' }, formatLocal(t.start), ' · ', h('strong', {}, statusText(t, now))),
    (t.from || t.to) && h('p', { class: 'route' }, [t.from, t.to].filter(Boolean).join(' ← ')),
    h('div', { class: 'docs' },
      (t.docs || []).map(docButton),
      h('button', { type: 'button', class: 'doc add', onclick: () => openDocDialog({ kind: 'transition', id: t.id }) }, '+ מסמך')),
    t.notes && h('div', { class: 'notes' }, t.notes),
    t.end && h('p', { class: 'arrive' }, 'הגעה: ', formatLocal(t.end)),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'link', onclick: () => openForm(t) }, 'עריכה'),
      h('button', { type: 'button', class: 'link danger', onclick: () => removeTransition(t) }, 'מחיקה')),
  );
}

function docButton(name) {
  const has = state.docNames.has(name);
  return h('button', {
    type: 'button',
    class: has ? 'doc has' : 'doc missing',
    onclick: () => (has ? openViewer(name) : uploadInto(name)),
  }, has ? `📄 ${name}` : `+ ${name}`);
}

// ---------- מסמכים ----------

function pickFile() {
  return new Promise((resolve) => {
    const input = $('#file-input');
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function saveDoc(name, file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && !file.type.startsWith('image/')) {
    toast('אפשר להעלות רק תמונה או PDF.');
    return false;
  }
  toast(isPdf ? 'ממיר את ה-PDF ושומר…' : 'שומר…', true);
  try {
    // מעתיקים את התוכן עכשיו, כי קובץ מהדרייב לא בהכרח יהיה זמין אחר כך
    const copy = new Blob([await file.arrayBuffer()], { type: isPdf ? 'application/pdf' : file.type });
    const pages = isPdf ? await (await import('./pdf-to-images.js')).pdfToImages(copy) : [copy];
    // ה-PDF המקורי נשמר גם הוא, כגיבוי אם משהו לא הומר טוב לתמונה
    await db.put('docs', { name, pages, original: isPdf ? copy : null, fileName: file.name, addedAt: Date.now() });
    navigator.storage?.persist?.().catch(() => {});
    toast(`נשמר: ${name}`);
    return true;
  } catch (e) {
    console.error(e);
    toast(isPdf ? 'לא הצלחתי לקרוא את ה-PDF. אפשר לצלם מסך ולהעלות תמונה.' : `לא הצלחתי לשמור: ${e.message}`);
    return false;
  }
}

async function uploadInto(name) {
  const file = await pickFile();
  if (file && await saveDoc(name, file)) await load();
}

let docTarget = null;
function openDocDialog(target) {
  docTarget = target;
  const known = new Set(['כרטיס טיסה', 'דרכון', 'ויזה', 'ביטוח', ...state.docNames, ...state.pinned]);
  $('#doc-names').replaceChildren(...[...known].map((n) => h('option', { value: n })));
  $('#form-doc').reset();
  $('#dlg-doc').showModal();
}

async function attachDoc(target, name) {
  if (target.kind === 'pinned') {
    if (!state.pinned.includes(name)) await db.setPinned([...state.pinned, name]);
  } else {
    const t = state.transitions.find((x) => x.id === target.id);
    if (t && !(t.docs || []).includes(name)) await db.put('transitions', { ...t, docs: [...(t.docs || []), name] });
  }
}

$('#form-doc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = new FormData(e.target).get('name').trim();
  if (!name || !docTarget) return;
  if (!state.docNames.has(name)) {
    const file = await pickFile();
    if (!file || !(await saveDoc(name, file))) return;
  }
  await attachDoc(docTarget, name);
  $('#dlg-doc').close();
  await load();
});

let viewerUrls = [];
let viewerName = null;
let viewerOriginal = null;

async function openViewer(name) {
  const doc = await db.get('docs', name);
  if (!doc) return;
  closeViewer();
  viewerName = name;
  viewerUrls = doc.pages.map((b) => URL.createObjectURL(b));
  viewerOriginal = doc.original ? { blob: doc.original, fileName: doc.fileName || `${name}.pdf` } : null;
  $('#viewer-original').hidden = !viewerOriginal;
  $('#viewer-title').textContent = name;
  $('#viewer-pages').replaceChildren(...viewerUrls.map((u, i) => h('img', { src: u, alt: `${name}, עמוד ${i + 1}` })));
  setZoomed(false);
  $('#viewer').hidden = false;
  $('#viewer-scroll').scrollTo(0, 0);
  document.body.classList.add('viewing');
  history.pushState({ viewer: name }, ''); // כפתור "חזרה" של אנדרואיד סוגר את המסמך
}

function closeViewer() {
  $('#viewer').hidden = true;
  document.body.classList.remove('viewing');
  viewerUrls.forEach((u) => URL.revokeObjectURL(u));
  viewerUrls = [];
}

// לחיצה כפולה על המסמך מגדילה אותו סביב הנקודה שנלחצה, לחיצה כפולה נוספת מחזירה. הזזה בגלילה רגילה.
// לחיצה אחת לא עושה כלום, כדי שלחיצה בטעות (למשל כשמושיטים את הטלפון) לא תגדיל.
let lastTap = null;
function setZoomed(on) {
  $('#viewer-pages').classList.toggle('zoomed', on);
  $('#viewer-pages').style.width = on ? `${ZOOM * 100}%` : '';
  $('#viewer-hint').textContent = on ? 'לחיצה כפולה מקטינה' : 'לחיצה כפולה מגדילה';
  lastTap = null;
}

$('#viewer-pages').addEventListener('click', (e) => {
  const img = e.target.closest('img');
  if (!img) return;
  const tapNow = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  if (!isDoubleTap(lastTap, tapNow)) { lastTap = tapNow; return; }
  const box = img.getBoundingClientRect();
  const rx = (e.clientX - box.left) / box.width;
  const ry = (e.clientY - box.top) / box.height;
  const scroller = $('#viewer-scroll');
  const view = scroller.getBoundingClientRect();
  setZoomed(!$('#viewer-pages').classList.contains('zoomed'));
  const pos = zoomScroll({
    rx, ry,
    img: { left: img.offsetLeft, top: img.offsetTop, width: img.offsetWidth, height: img.offsetHeight },
    tap: { x: e.clientX - view.left, y: e.clientY - view.top },
    view: { width: scroller.clientWidth, height: scroller.clientHeight },
    content: { width: scroller.scrollWidth, height: scroller.scrollHeight },
  });
  scroller.scrollTo(pos.left, pos.top);
});

window.addEventListener('popstate', () => { if (!$('#viewer').hidden) closeViewer(); });
$('#viewer-close').addEventListener('click', () => history.back());

// פותח את ה-PDF המקורי באפליקציית ה-PDF של הטלפון (עובד גם בלי רשת)
$('#viewer-original').addEventListener('click', () => {
  if (!viewerOriginal) return;
  const url = URL.createObjectURL(viewerOriginal.blob);
  h('a', { href: url, download: viewerOriginal.fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
});

$('#viewer-replace').addEventListener('click', async () => {
  const name = viewerName;
  const file = await pickFile();
  if (file && await saveDoc(name, file)) {
    history.back();
    await load();
  }
});

$('#viewer-delete').addEventListener('click', async () => {
  if (!confirm(`למחוק את "${viewerName}" מהטלפון?`)) return;
  await db.del('docs', viewerName);
  history.back();
  await load();
});

// ---------- מעברים ----------

async function removeTransition(t) {
  if (!confirm(`למחוק את המעבר "${t.title}"?`)) return;
  await db.del('transitions', t.id);
  await load();
}

let editing = null;
const phoneOffset = (local) => -new Date(local).getTimezoneOffset();

function openForm(t = null) {
  editing = t;
  const form = $('#form-transition');
  form.reset();
  $('#form-error').textContent = '';
  $('#form-heading').textContent = t ? 'עריכת מעבר' : 'מעבר חדש';
  if (t) {
    const f = form.elements;
    f.namedItem('title').value = t.title;
    f.namedItem('start').value = toLocalInputValue(t.start);
    f.namedItem('end').value = toLocalInputValue(t.end);
    f.namedItem('from').value = t.from || '';
    f.namedItem('to').value = t.to || '';
    f.namedItem('notes').value = t.notes || '';
    f.namedItem('docs').value = (t.docs || []).join(', ');
    $('#form-tz').textContent = 'השעות נשמרות לפי השעון של המקום, כמו שהיו.';
  } else {
    $('#form-tz').textContent = `השעות נשמרות לפי השעון של הטלפון עכשיו (${offsetString(-new Date().getTimezoneOffset())}).`;
  }
  $('#dlg-form').showModal();
}

$('#form-transition').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const startLocal = f.get('start');
  const endLocal = f.get('end');
  const startOff = editing ? offsetMinutesOf(editing.start) : phoneOffset(startLocal);
  const endOff = editing ? (editing.end ? offsetMinutesOf(editing.end) : startOff) : phoneOffset(endLocal || startLocal);
  const t = {
    id: editing ? editing.id : `m-${Date.now().toString(36)}`,
    title: f.get('title').trim(),
    start: withOffset(startLocal, startOff),
    docs: docNamesFromText(f.get('docs')),
  };
  if (endLocal) t.end = withOffset(endLocal, endOff);
  for (const k of ['from', 'to', 'notes']) if (f.get(k).trim()) t[k] = f.get(k).trim();
  if (t.end && Date.parse(t.end) < Date.parse(t.start)) {
    $('#form-error').textContent = 'ההגעה לפני היציאה.';
    return;
  }
  await db.put('transitions', t);
  $('#dlg-form').close();
  await load();
});

// ---------- ייבוא ----------

$('#form-import').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { transitions, pinned } = parseImport($('#import-text').value);
    for (const t of transitions) await db.put('transitions', t); // אותו id מתעדכן
    const allPinned = [...new Set([...state.pinned, ...pinned])];
    if (allPinned.length !== state.pinned.length) await db.setPinned(allPinned);
    $('#dlg-import').close();
    toast(`יובאו ${transitions.length} מעברים`);
    await load();
  } catch (err) {
    $('#import-error').textContent = err.message;
  }
});

$('#import-paste').addEventListener('click', async () => {
  try {
    $('#import-text').value = await navigator.clipboard.readText();
  } catch {
    $('#import-error').textContent = 'אין גישה ללוח. אפשר ללחוץ לחיצה ארוכה בתיבה ולבחור "הדבק".';
  }
});

$('#btn-import').addEventListener('click', () => {
  $('#import-text').value = '';
  $('#import-error').textContent = '';
  $('#dlg-import').showModal();
});
$('#btn-add').addEventListener('click', () => openForm());
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- עזרים ----------

let toastTimer;
function toast(msg, sticky = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

async function updateStatus() {
  const ready = !!navigator.serviceWorker?.controller;
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const el = $('#offline-status');
  el.textContent = ready
    ? `✓ מוכן לעבודה בלי רשת${persisted ? ' · ✓ האחסון קבוע' : ''}`
    : '⏳ עוד לא מוכן לעבודה בלי רשת. צריך לפתוח פעם אחת עם אינטרנט.';
  el.classList.toggle('ok', ready);
  showVersion();
}

// מספר הגרסה בא משם ה-cache ב-sw.js, כדי שיהיה לו מקור אחד בלבד
async function showVersion() {
  try {
    const versions = (await caches.keys())
      .map((n) => /^tik-v(\d+)$/.exec(n)).filter(Boolean).map((m) => +m[1]);
    $('#app-version').textContent = versions.length ? `גרסה ${Math.max(...versions)}` : '';
  } catch {
    // בלי cache אין מספר גרסה, וזה בסדר
  }
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.error(e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // עדכון לגרסה חדשה: טוענים מחדש פעם אחת כדי שהקוד החדש ירוץ. בהתקנה ראשונה אין צורך.
    if (hadController) location.reload();
    else updateStatus();
  });
}
navigator.storage?.persist?.().catch(() => {});

setInterval(render, 30 * 1000); // הספירה לאחור מתעדכנת, ומעבר שעבר נעלם לבד
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

updateStatus();
load();
