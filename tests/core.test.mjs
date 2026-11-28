// בדיקות ללוגיקה הטהורה ב-core.js. כל המידע כאן מזויף.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTransitions, activeUntil, formatLocal, untilText, statusText,
  offsetString, withOffset, toLocalInputValue, offsetOf, parseImport,
  docNamesFromText, GRACE_MS, ZOOM, zoomScroll, isDoubleTap, libraryNames, mapsUrl,
} from '../core.js';

const H = 3600 * 1000;
const t = (id, start, end) => ({ id, title: id, start, ...(end ? { end } : {}) });

test('המעבר הבא הוא הראשון לפי שעת יציאה, ומעבר שעבר נעלם', () => {
  const list = [
    t('c', '2030-01-12T10:00:00+07:00'),
    t('a', '2030-01-10T10:00:00+07:00', '2030-01-10T12:00:00+07:00'),
    t('b', '2030-01-11T10:00:00+07:00'),
  ];
  const now = Date.parse('2030-01-10T13:00:00+07:00'); // a כבר נגמר
  const { next, later } = splitTransitions(list, now);
  assert.equal(next.id, 'b');
  assert.deepEqual(later.map(x => x.id), ['c']);
});

test('מעבר שהתחיל ועוד לא נגמר נשאר המעבר הבא', () => {
  const list = [t('a', '2030-01-10T10:00:00+07:00', '2030-01-10T20:00:00+07:00'), t('b', '2030-01-11T10:00:00+07:00')];
  const now = Date.parse('2030-01-10T15:00:00+07:00');
  assert.equal(splitTransitions(list, now).next.id, 'a');
});

test('מעבר בלי שעת הגעה פעיל עד 6 שעות אחרי היציאה', () => {
  const a = t('a', '2030-01-10T10:00:00+00:00');
  assert.equal(activeUntil(a), Date.parse('2030-01-10T10:00:00Z') + GRACE_MS);
  assert.equal(GRACE_MS, 6 * H);
  assert.equal(splitTransitions([a], Date.parse('2030-01-10T15:59:00Z')).next.id, 'a');
  assert.equal(splitTransitions([a], Date.parse('2030-01-10T16:01:00Z')).next, null);
});

test('סדר לפי זמן אמיתי גם כשאזורי הזמן שונים', () => {
  // 16:05 בקטמנדו (10:20Z) מוקדם מ-14:00 בשעון +08:00 (06:00Z)? לא: 06:00Z מוקדם יותר
  const list = [t('ktm', '2030-01-10T16:05:00+05:45'), t('east', '2030-01-10T14:00:00+08:00')];
  const { next, later } = splitTransitions(list, Date.parse('2030-01-10T00:00:00Z'));
  assert.equal(next.id, 'east');
  assert.equal(later[0].id, 'ktm');
});

test('אין מעברים: אין מעבר הבא', () => {
  assert.deepEqual(splitTransitions([], Date.now()), { arrived: null, next: null, later: [] });
});

// באג שנמצא במעבר משתמש: הערות "מה לעשות כשמגיעים" נעלמו בדיוק ברגע ההגעה.
test('אחרי נחיתה המעבר מוצג ב"הגעת" 6 שעות, ולא נעלם ברגע ההגעה', () => {
  const flight = { ...t('f', '2030-01-10T07:25:00+08:00', '2030-01-10T08:00:00+07:00'), notes: 'לינה' };
  assert.equal(splitTransitions([flight], Date.parse('2030-01-10T09:00:00+07:00')).arrived?.id, 'f');
  assert.equal(splitTransitions([flight], Date.parse('2030-01-10T13:59:00+07:00')).arrived?.id, 'f');
  assert.equal(splitTransitions([flight], Date.parse('2030-01-10T14:01:00+07:00')).arrived, null);
});

test('חיבור צפוף: מה שנחת וגם המעבר הבא מוצגים יחד', () => {
  const bus = t('bus', '2030-01-09T20:00:00+07:00', '2030-01-10T04:00:00+07:00');
  const loop = t('loop', '2030-01-10T08:00:00+07:00');
  const r = splitTransitions([loop, bus], Date.parse('2030-01-10T06:00:00+07:00'));
  assert.equal(r.arrived?.id, 'bus');
  assert.equal(r.next?.id, 'loop');
  assert.deepEqual(r.later, []);
});

test('כשכמה מעברים נחתו, מוצג רק האחרון', () => {
  const a = t('a', '2030-01-10T06:00:00Z', '2030-01-10T07:00:00Z');
  const b = t('b', '2030-01-10T08:00:00Z', '2030-01-10T09:00:00Z');
  assert.equal(splitTransitions([b, a], Date.parse('2030-01-10T10:00:00Z')).arrived?.id, 'b');
});

test('מעבר בלי שעת הגעה לא נכנס ל"הגעת"', () => {
  const a = t('a', '2030-01-10T10:00:00Z');
  assert.equal(splitTransitions([a], Date.parse('2030-01-10T12:00:00Z')).arrived, null);
  assert.equal(splitTransitions([a], Date.parse('2030-01-10T17:00:00Z')).arrived, null);
});

test('השעה מוצגת לפי השעון של המקום, לא של הטלפון', () => {
  // 10.1.2030 הוא יום חמישי
  assert.equal(formatLocal('2030-01-10T16:05:00+05:45'), 'יום ה׳ 10.1 · 16:05');
  assert.equal(formatLocal('2030-01-11T07:25:00+08:00'), 'יום ו׳ 11.1 · 07:25');
  assert.equal(formatLocal('2030-01-13T00:30:00Z'), 'יום א׳ 13.1 · 00:30');
});

test('ספירה לאחור בעברית', () => {
  const M = 60 * 1000;
  assert.equal(untilText(5 * M), 'בעוד 5 דק׳');
  assert.equal(untilText(0), 'בעוד פחות מדקה');
  assert.equal(untilText(1 * H), 'בעוד שעה');
  assert.equal(untilText(1 * H + 20 * M), 'בעוד שעה ו-20 דק׳');
  assert.equal(untilText(3 * H + 5 * M), 'בעוד 3 שעות ו-5 דק׳');
  assert.equal(untilText(24 * H), 'בעוד יום');
  assert.equal(untilText(26 * H), 'בעוד יום ו-2 שעות');
  assert.equal(untilText(3 * 24 * H + 4 * H), 'בעוד 3 ימים');
});

test('סטטוס: לפני יציאה, בדרך, והגעת', () => {
  const a = t('a', '2030-01-10T10:00:00Z', '2030-01-10T12:00:00Z');
  assert.equal(statusText(a, Date.parse('2030-01-10T08:00:00Z')), 'בעוד 2 שעות');
  assert.equal(statusText(a, Date.parse('2030-01-10T11:00:00Z')), 'עכשיו, בדרך');
  assert.equal(statusText(a, Date.parse('2030-01-10T13:00:00Z')), 'הגעת');
  // בלי שעת הגעה אין "הגעת"
  assert.equal(statusText(t('b', '2030-01-10T10:00:00Z'), Date.parse('2030-01-10T13:00:00Z')), 'עכשיו, בדרך');
});

test('אזור זמן: כתיבה וקריאה', () => {
  assert.equal(offsetString(345), '+05:45');
  assert.equal(offsetString(-180), '-03:00');
  assert.equal(offsetString(0), '+00:00');
  assert.equal(withOffset('2030-01-10T19:00', 420), '2030-01-10T19:00:00+07:00');
  assert.equal(toLocalInputValue('2030-01-10T16:05:00+05:45'), '2030-01-10T16:05');
  assert.equal(offsetOf('2030-01-10T16:05:00+05:45'), '+05:45');
  assert.equal(offsetOf('2030-01-10T16:05:00Z'), '+00:00');
});

test('שמות מסמכים מטקסט עם פסיקים', () => {
  assert.deepEqual(docNamesFromText(' כרטיס, דרכון ,,כרטיס '), ['כרטיס', 'דרכון']);
  assert.deepEqual(docNamesFromText(''), []);
});

const valid = {
  transitions: [{
    id: 'x1', title: 'טיסה', start: '2030-01-10T16:05:00+05:45', end: '2030-01-10T21:15:00+08:00',
    from: 'א', to: 'ב', address: '  רחוב מזויף 1, עיר ב  ', notes: 'שורה 1\nשורה 2', docs: ['כרטיס', 'דרכון'],
  }],
  pinned: ['דרכון', 'ויזה'],
};

test('ייבוא תקין, גם כשהקוד מגיע עטוף ב-```', () => {
  const r = parseImport('```json\n' + JSON.stringify(valid) + '\n```');
  assert.equal(r.transitions.length, 1);
  assert.equal(r.transitions[0].notes, 'שורה 1\nשורה 2');
  assert.equal(r.transitions[0].address, 'רחוב מזויף 1, עיר ב');
  assert.deepEqual(r.pinned, ['דרכון', 'ויזה']);
});

test('ייבוא שגוי מחזיר הודעה ברורה בעברית', () => {
  assert.throws(() => parseImport('זה לא קוד'), /לא הצלחתי לקרוא את הקוד/);
  assert.throws(() => parseImport('[]'), /חסר/);
  assert.throws(() => parseImport(JSON.stringify({ transitions: [{ id: 'a', start: '2030-01-10T10:00:00Z' }] })), /מעבר 1: חסרה כותרת/);
  assert.throws(() => parseImport(JSON.stringify({ transitions: [{ id: 'a', title: 'x', start: '2030-01-10T10:00' }] })), /מעבר 1: .*אזור זמן/);
  assert.throws(() => parseImport(JSON.stringify({ transitions: [{ id: 'a', title: 'x', start: '2030-01-10T10:00:00Z', end: '2030-01-10T09:00:00Z' }] })), /מעבר 1: ההגעה לפני היציאה/);
  assert.throws(() => parseImport(JSON.stringify({ transitions: [{ title: 'x', start: '2030-01-10T10:00:00Z' }] })), /מעבר 1: חסר id/);
});

// חיכוך 23.11: פקיד ניסה להגדיל צילום מסך של אישור ולא הצליח. לחיצה מגדילה סביב הנקודה שנלחצה.
test('הגדלה: הנקודה שנלחצה נשארת מתחת לאצבע', () => {
  const view = { width: 400, height: 800 };
  const img = { left: 0, top: 0, width: 400 * ZOOM, height: 300 * ZOOM };
  const content = { width: img.width, height: 2000 };
  const pos = zoomScroll({ rx: 0.7, ry: 0.5, img, tap: { x: 280, y: 150 }, view, content });
  assert.equal(pos.left - 0 + 280, Math.round(0.7 * img.width)); // אותה נקודה במסמך, אותו מקום על המסך
  assert.equal(pos.top + 150, Math.round(0.5 * img.height));
  assert.ok(ZOOM >= 2, 'הגדלה מספיקה כדי לקרוא אותיות קטנות');
});

test('הגדלה: לא גוללים אל מחוץ למסמך', () => {
  const view = { width: 400, height: 800 };
  const img = { left: 0, top: 0, width: 1000, height: 750 };
  const content = { width: 1000, height: 900 };
  const corner = zoomScroll({ rx: 0, ry: 0, img, tap: { x: 300, y: 300 }, view, content });
  assert.deepEqual(corner, { left: 0, top: 0 });
  const edge = zoomScroll({ rx: 1, ry: 1, img, tap: { x: 10, y: 10 }, view, content });
  assert.deepEqual(edge, { left: 600, top: 100 });
});

test('הקטנה חזרה: התמונה נשארת במקום שלה ולא קופצת להתחלה', () => {
  const view = { width: 400, height: 800 };
  // עמוד שני של PDF, אחרי הקטנה
  const img = { left: 0, top: 600, width: 400, height: 560 };
  const content = { width: 400, height: 1800 };
  const pos = zoomScroll({ rx: 0.5, ry: 0.5, img, tap: { x: 200, y: 400 }, view, content });
  assert.deepEqual(pos, { left: 0, top: 600 + 280 - 400 });
});

// 23.11: לחיצה אחת הגדילה בטעות. מעכשיו רק לחיצה כפולה מגדילה.
test('לחיצה כפולה: רק שתי לחיצות קרובות בזמן ובמקום', () => {
  const a = { t: 1000, x: 200, y: 300 };
  assert.equal(isDoubleTap(null, a), false, 'לחיצה ראשונה לבד היא לא לחיצה כפולה');
  assert.equal(isDoubleTap(a, { t: 1250, x: 210, y: 305 }), true);
  assert.equal(isDoubleTap(a, { t: 1600, x: 200, y: 300 }), false, 'רחוק מדי בזמן');
  assert.equal(isDoubleTap(a, { t: 1200, x: 300, y: 300 }), false, 'רחוק מדי במקום');
});

// חיכוך 22.11: מסמכים בשני מקומות. מעכשיו כל המסמכים גרים בספרייה אחת, והכרטיס מציג רק קיצורי דרך.
test('ספרייה: קודם הקבועים לפי הסדר שלהם, אחריהם השאר לפי א-ב', () => {
  assert.deepEqual(
    libraryNames(['דרכון', 'ויזה'], ['קבלה', 'דרכון', 'כרטיס', 'ביטוח']),
    ['דרכון', 'ויזה', 'ביטוח', 'כרטיס', 'קבלה'],
  );
});

test('ספרייה: כל מסמך פעם אחת, גם קבוע שעוד לא הועלה', () => {
  const lib = libraryNames(['ויזה', 'דרכון', 'ויזה'], ['דרכון', 'דרכון']);
  assert.deepEqual(lib, ['ויזה', 'דרכון']);
  assert.equal(new Set(lib).size, lib.length);
});

test('ספרייה: ריקה כשאין כלום', () => {
  assert.deepEqual(libraryNames([], []), []);
  assert.deepEqual(libraryNames(), []);
});

// חיכוך 25.11: המיקום היה רק טקסט, ולראות אותו במפות דרש להקליד הכול מחדש.
test('מפות: כתובת הופכת לקישור שפותח את אפליקציית המפות', () => {
  const url = mapsUrl('רחוב מזויף 1, עיר ב');
  assert.match(url, /^geo:0,0\?q=/);
  assert.equal(decodeURIComponent(url.slice('geo:0,0?q='.length)), 'רחוב מזויף 1, עיר ב');
  assert.ok(!/[\s#&]/.test(url), 'אין בקישור תווים ששוברים אותו');
});

test('מפות: כתובת בכמה שורות (מהמייל) הופכת לשורה אחת', () => {
  assert.equal(mapsUrl('  מלון מזויף\nרחוב 5 &  #2\n'), mapsUrl('מלון מזויף רחוב 5 & #2'));
  assert.equal(decodeURIComponent(mapsUrl('א\n\nב').split('q=')[1]), 'א ב');
});

test('מפות: בלי כתובת אין קישור', () => {
  assert.equal(mapsUrl(''), null);
  assert.equal(mapsUrl('   '), null);
  assert.equal(mapsUrl(undefined), null);
});

// חיכוך 25.11: להכניס מעבר דרש לבוא לסשן עם הריפו. הסקיל skills/tik-import מלמד כל Claude להכין קוד ייבוא.
// אם הפורמט ב-core.js משתנה והדוגמה בסקיל כבר לא נקראת, הבדיקה נכשלת, כדי שהסקיל לא ילמד פורמט ישן.
test('סקיל הייבוא: הדוגמה בסקיל עוברת ייבוא, עם כל השדות', async () => {
  const { readFile } = await import('node:fs/promises');
  const md = await readFile(new URL('../skills/tik-import/SKILL.md', import.meta.url), 'utf8');
  const block = /```json\n([\s\S]*?)```/.exec(md);
  assert.ok(block, 'יש בסקיל דוגמת JSON');
  const { transitions } = parseImport(block[1]);
  assert.equal(transitions.length, 1);
  const x = transitions[0];
  for (const k of ['id', 'title', 'start', 'end', 'from', 'to', 'address', 'notes']) assert.ok(x[k], `השדה ${k} נשמר`);
  assert.ok(x.docs.length > 0);
  assert.ok(Date.parse(x.end) > Date.parse(x.start));
  assert.match(md, /^---\nname: tik-import\ndescription: .+\n---/, 'כותרת סקיל תקינה');
});
