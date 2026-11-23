// בדיקת קצה לקצה בגודל טלפון: ייבוא, מסמכים, טופס, ואז בלי רשת.
// כל המידע כאן מזויף. צילומי מסך נשמרים ב-E2E_OUT (ברירת מחדל: test-results/).
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 8123;
const BASE = `http://localhost:${PORT}/Project1/`;
const OUT = process.env.E2E_OUT || 'test-results';
const H = 3600 * 1000;

let failed = 0;
function check(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
}

// מחרוזת ISO עם אזור זמן נתון (בדקות)
function iso(ms, offMin) {
  const d = new Date(ms + offMin * 60000);
  const p = (n) => String(n).padStart(2, '0');
  const sign = offMin < 0 ? '-' : '+';
  const a = Math.abs(offMin);
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

await mkdir(OUT, { recursive: true });
const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const VERSION = /tik-v(\d+)/.exec(swSource)[1];
const overrides = new Map();
const server = await serve(PORT, '/Project1', overrides);
const browser = await chromium.launch();

try {
  // קבצים מזויפים: PDF ותמונה
  const fx = await browser.newPage();
  // QR מזויף מריבועים שחורים (וקטורים), כמו בכרטיסי טיסה אמיתיים
  let qr = '';
  for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) {
    if ((i * 7 + j * 13 + i * j) % 3 === 0) qr += `<div style="position:absolute;left:${j * 10}px;top:${i * 10}px;width:10px;height:10px;background:#000"></div>`;
  }
  await fx.setContent(`<div style="font:36px sans-serif;padding:40px">FAKE BOARDING PASS<br>TEST-000
    <div style="position:relative;width:210px;height:210px;margin-top:24px">${qr}</div></div>`);
  const pdfBuf = await fx.pdf({ format: 'A5', printBackground: true });
  await fx.setContent('<div style="font:40px sans-serif;padding:40px;background:#e8e0c8;height:400px">FAKE PASSPORT</div>');
  const pngBuf = await fx.screenshot();
  // צילום מסך של מייל מהטלפון: גבוה וצר, עם אותיות קטנות
  await fx.setViewportSize({ width: 400, height: 1400 });
  await fx.setContent(`<div style="font:13px sans-serif;padding:16px;background:#fff">${'FAKE RECEIPT LINE 000<br>'.repeat(80)}</div>`);
  const shotBuf = await fx.screenshot();
  await fx.close();

  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'he-IL', timezoneId: 'Asia/Kathmandu',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await page.waitForSelector('#offline-status.ok');
  check(true, 'ה-Service Worker פעיל והמחוון מראה "מוכן לעבודה בלי רשת"');
  await page.waitForFunction((v) => document.querySelector('#app-version').textContent === `גרסה ${v}`, VERSION, { timeout: 5000 })
    .then(() => check(true, `מספר הגרסה מוצג (גרסה ${VERSION})`), () => check(false, 'מספר הגרסה מוצג'));
  check(await page.isVisible('text=אין מעברים קרובים'), 'מסך ריק מסביר מה לעשות');

  // ייבוא, עטוף ב-``` כמו שמעתיקים מהצ'אט
  const now = Date.now();
  const data = {
    transitions: [
      { id: 'f1', title: 'טיסה מזויפת', start: iso(now + 3 * H, 345), end: iso(now + 8 * H, 480),
        from: 'עיר א', to: 'עיר ב', notes: 'להגיע שעתיים לפני.\nמזוודה אחת.', docs: ['כרטיס', 'דרכון'] },
      { id: 'f2', title: 'טיסה שנייה', start: iso(now + 20 * H, 480), end: iso(now + 22 * H, 420), docs: ['כרטיס'] },
      { id: 'old', title: 'מעבר שעבר', start: iso(now - 30 * H, 0), end: iso(now - 20 * H, 0) },
      { id: 'landed', title: 'טיסה שנחתה', start: iso(now - 3 * H, 480), end: iso(now - 1 * H, 420),
        notes: 'הערת נחיתה מזויפת', docs: ['כרטיס'] },
      { id: 'landed-old', title: 'טיסה שנחתה מזמן', start: iso(now - 10 * H, 0), end: iso(now - 7 * H, 0) },
    ],
    pinned: ['דרכון', 'ויזה'],
  };
  await page.click('#btn-import');
  await page.fill('#import-text', 'garbage');
  await page.click('#form-import button[type=submit]');
  check((await page.textContent('#import-error')).includes('לא הצלחתי לקרוא'), 'קוד שגוי מקבל הודעה ברורה');
  await page.fill('#import-text', '```json\n' + JSON.stringify(data, null, 2) + '\n```');
  await page.click('#form-import button[type=submit]');
  await page.waitForSelector('#next h1:has-text("טיסה מזויפת")');
  check(true, 'ייבוא: המעבר הבא מוצג');
  check(!(await page.isVisible('text=מעבר שעבר')), 'מעבר שעבר לא מוצג');
  check(await page.isVisible('#later summary:has-text("טיסה שנייה")'), 'המעבר שאחריו נמצא ב"אחר כך"');
  check(/בעוד (2|3) שעות/.test(await page.textContent('#next .when')), 'ספירה לאחור');
  // הבאג שתוקן: מה שנחת לפני שעה נשאר למעלה עם ההערות שלו
  check(await page.isVisible('#arrived h1:has-text("טיסה שנחתה")'), 'טיסה שנחתה לפני שעה מוצגת ב"הגעת"');
  check((await page.textContent('#arrived .notes')).includes('הערת נחיתה מזויפת'), 'ההערות של מה שנחת מוצגות');
  check((await page.textContent('#arrived .when')).includes('הגעת'), 'הסטטוס הוא "הגעת"');
  check(!(await page.isVisible('text=טיסה שנחתה מזמן')), 'מה שנחת לפני 7 שעות כבר לא מוצג');

  // ייבוא חוזר עם אותו id מעדכן
  await page.click('#btn-import');
  await page.fill('#import-text', JSON.stringify({ transitions: [{ ...data.transitions[1], title: 'טיסה שנייה (עודכן)' }] }));
  await page.click('#form-import button[type=submit]');
  await page.waitForSelector('#later summary:has-text("טיסה שנייה (עודכן)")');
  check((await page.$$('#later details')).length === 1, 'ייבוא חוזר מעדכן ולא משכפל');

  // PDF לכרטיס, תמונה לדרכון
  const [fc1] = await Promise.all([page.waitForEvent('filechooser'), page.click('#next button.doc.missing:has-text("כרטיס")')]);
  await fc1.setFiles({ name: 'fake-ticket.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
  await page.waitForSelector('#next button.doc.has:has-text("כרטיס")', { timeout: 30000 });
  check(true, 'PDF הועלה');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pinned button.doc.missing:has-text("דרכון")')]);
  await fc2.setFiles({ name: 'fake-passport.png', mimeType: 'image/png', buffer: pngBuf });
  await page.waitForSelector('#pinned button.doc.has:has-text("דרכון")');
  check(await page.isVisible('#next button.doc.has:has-text("דרכון")'), 'מסמך משותף לפי שם: הדרכון מופיע גם במעבר');

  // מסמך קבוע חדש דרך החלון
  await page.click('#pinned button.doc.add');
  await page.fill('#form-doc [name=name]', 'ביטוח');
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#form-doc button[type=submit]')]);
  await fc3.setFiles({ name: 'fake-insurance.png', mimeType: 'image/png', buffer: pngBuf });
  await page.waitForSelector('#pinned button.doc.has:has-text("ביטוח")');
  check(true, 'מסמך קבוע חדש נוסף דרך החלון');
  await page.waitForTimeout(3200); // שההודעה תיעלם לפני הצילום
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/1-main.png` });

  await page.click('#next button.doc.has:has-text("כרטיס")');
  await page.waitForSelector('#viewer:not([hidden]) img');
  check(await page.$eval('#viewer img', (img) => img.complete && img.naturalWidth >= 1000), 'ה-PDF נפתח כתמונה חדה');
  // הפסים (כמו ברקוד או QR) חייבים להופיע בתמונה, לא רק הטקסט
  const darkShare = await page.$eval('#viewer img', (img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    let pink = 0; // הצבע ש-pdf.js מצייר כשהוא נכשל בגרפיקה
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] + px[i + 1] + px[i + 2] < 150) dark++;
      if (px[i] > 240 && px[i + 1] > 90 && px[i + 1] < 120 && px[i + 2] > 170 && px[i + 2] < 190) pink++;
    }
    return { dark: dark / (px.length / 4), pink };
  });
  check(darkShare.dark > 0.02 && darkShare.pink === 0, `ה-QR מה-PDF מופיע בתמונה (${(darkShare.dark * 100).toFixed(1)}% פיקסלים כהים, בלי כשל)`);
  check(await page.isVisible('#viewer-original'), 'ל-PDF יש כפתור לפתיחת הקובץ המקורי');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#viewer-original')]);
  check(download.suggestedFilename() === 'fake-ticket.pdf', 'הקובץ המקורי נפתח כ-PDF');
  await page.screenshot({ path: `${OUT}/2-viewer.png` });
  await page.goBack();
  check(await page.isHidden('#viewer'), 'כפתור "חזרה" סוגר את המסמך');

  // חיכוכים 23.11: צילום מסך נפתח ברוחב מלא ומגדילים אותו בלחיצה, ו"סגירה" בהישג האגודל
  await page.click('#pinned button.doc.add');
  await page.fill('#form-doc [name=name]', 'קבלה');
  const [fc4] = await Promise.all([page.waitForEvent('filechooser'), page.click('#form-doc button[type=submit]')]);
  await fc4.setFiles({ name: 'fake-receipt.png', mimeType: 'image/png', buffer: shotBuf });
  await page.waitForSelector('#pinned button.doc.has:has-text("קבלה")');
  await page.click('#pinned button.doc.has:has-text("קבלה")');
  await page.waitForSelector('#viewer:not([hidden]) img');
  await page.waitForFunction(() => document.querySelector('#viewer img').complete);
  const vh = 915;
  if (await page.isVisible('#toast')) {
    const t = await page.$eval('#toast', (e) => e.getBoundingClientRect().toJSON());
    const c = await page.$eval('#viewer-close', (b) => b.getBoundingClientRect().toJSON());
    check(t.bottom <= c.top, 'ההודעה הקופצת לא מסתירה את "סגירה"');
  }
  const closeBox = await page.$eval('#viewer-close', (b) => b.getBoundingClientRect().toJSON());
  check(closeBox.bottom <= vh && closeBox.top >= vh * 0.8, `"סגירה" בתחתית המסך, בהישג האגודל (${Math.round(closeBox.top)}–${Math.round(closeBox.bottom)} מתוך ${vh})`);
  check(closeBox.width >= 300 && closeBox.height >= 48, '"סגירה" גדול מספיק לאגודל');
  const imgBox = await page.$eval('#viewer img', (i) => i.getBoundingClientRect().toJSON());
  check(Math.abs(imgBox.width - 412) <= 1, 'התמונה נפתחת ברוחב המסך המלא');
  const tap = { x: Math.round(imgBox.left + imgBox.width * 0.7), y: Math.round(imgBox.top + 400) }; // נקודה שרואים על המסך
  const ry = (tap.y - imgBox.top) / imgBox.height;
  await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForTimeout(600);
  check(await page.$eval('#viewer-pages', (p) => !p.classList.contains('zoomed')), 'לחיצה אחת לא מגדילה');
  await page.touchscreen.tap(tap.x, tap.y);
  await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForSelector('#viewer-pages.zoomed');
  const z = await page.$eval('#viewer img', (i) => i.getBoundingClientRect().toJSON());
  check(z.width >= imgBox.width * 2, `לחיצה כפולה מגדילה את התמונה (פי ${(z.width / imgBox.width).toFixed(1)})`);
  const landed = { x: z.left + z.width * 0.7, y: z.top + z.height * ry };
  check(Math.abs(landed.x - tap.x) <= 3 && Math.abs(landed.y - tap.y) <= 3, 'ההגדלה סביב הנקודה שנלחצה');
  await page.screenshot({ path: `${OUT}/2b-zoomed.png` });
  const scrolled = await page.$eval('#viewer-scroll', (s) => { s.scrollBy(150, 0); return s.scrollLeft; });
  check(scrolled > 0, 'בהגדלה אפשר להזיז את התמונה הצידה');
  check(await page.$eval('#viewer-close', (b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), '"סגירה" נשאר על המסך גם בהגדלה');
  await page.waitForTimeout(600);
  await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForTimeout(600);
  check(await page.$eval('#viewer-pages', (p) => p.classList.contains('zoomed')), 'בהגדלה, לחיצה אחת לא מקטינה');
  await page.touchscreen.tap(tap.x, tap.y);
  await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForSelector('#viewer-pages:not(.zoomed)');
  const back = await page.$eval('#viewer img', (i) => i.getBoundingClientRect().width);
  check(Math.abs(back - 412) <= 1, 'לחיצה כפולה נוספת מחזירה לגודל רגיל');
  await page.touchscreen.tap(tap.x, tap.y);
  await page.touchscreen.tap(tap.x, tap.y); // שוב מוגדל, כדי לבדוק שפתיחה הבאה מתחילה רגיל
  await page.click('#viewer-close');
  await page.waitForSelector('#viewer', { state: 'hidden' });
  check(true, '"סגירה" סוגר את המסמך');
  await page.click('#pinned button.doc.has:has-text("קבלה")');
  await page.waitForSelector('#viewer:not([hidden]) img');
  check(await page.$eval('#viewer-pages', (p) => !p.classList.contains('zoomed')), 'מסמך נפתח שוב בגודל רגיל');
  await page.goBack();
  await page.waitForSelector('#viewer', { state: 'hidden' });

  // טופס ידני: השעה נשמרת לפי שעון הטלפון
  const local = await page.evaluate(() => {
    const d = new Date(Date.now() + 30 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  await page.click('#btn-add');
  await page.fill('#form-transition [name=title]', 'אוטובוס מזויף');
  await page.fill('#form-transition [name=start]', local);
  await page.fill('#form-transition [name=notes]', 'הערה מזויפת');
  await page.click('#form-transition button[type=submit]');
  await page.waitForSelector('#later summary:has-text("אוטובוס מזויף")');
  const summary = await page.textContent('#later details:has-text("אוטובוס מזויף") .later-when');
  check(summary.includes(local.slice(11)), `טופס: מעבר ידני נשמר בשעה שהוקלדה (${local.slice(11)})`);

  // עריכה שומרת את אזור הזמן המקורי
  await page.click('#later details:has-text("טיסה שנייה") summary');
  const before = await page.textContent('#later details:has-text("טיסה שנייה") .when');
  await page.click('#later details:has-text("טיסה שנייה") button:has-text("עריכה")');
  await page.fill('#form-transition [name=title]', 'טיסה שנייה (נערך)');
  await page.click('#form-transition button[type=submit]');
  await page.waitForSelector('#later summary:has-text("טיסה שנייה (נערך)")');
  await page.click('#later details:has-text("טיסה שנייה (נערך)") summary');
  const after = await page.textContent('#later details:has-text("טיסה שנייה (נערך)") .when');
  check(before.split(' · ').slice(0, 2).join() === after.split(' · ').slice(0, 2).join(), 'עריכה לא מזיזה את השעה');

  check(errors.length === 0, `אין שגיאות בקונסול${errors.length ? ': ' + errors.join(' | ') : ''}`);

  // עדכון לגרסה חדשה, כמו שיקרה בטלפון: פותחים את האפליקציה (כבר מותקנת), ה-Service Worker החדש
  // נכנס, הדף נטען מחדש לבד פעם אחת, והמידע נשאר.
  await page.reload();
  await page.waitForSelector('#next h1:has-text("טיסה מזויפת")');
  const NEXT = String(+VERSION + 1);
  overrides.set('/sw.js', swSource.replace(`tik-v${VERSION}`, `tik-v${NEXT}`));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update())).catch(() => {});
  const updated = await page.waitForFunction((v) => document.querySelector('#app-version')?.textContent === `גרסה ${v}`, NEXT, { timeout: 20000 })
    .then(() => true, () => false);
  check(updated, `עדכון: הגרסה החדשה (${NEXT}) נטענה לבד`);
  check(await page.isVisible('#next h1:has-text("טיסה מזויפת")'), 'עדכון: המידע והמסמכים נשארו');

  // בלי רשת: טעינה מחדש, וגם פתיחה בלשונית חדשה (כמו מהמסך הבית)
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#next h1:has-text("טיסה מזויפת")', { timeout: 10000 });
  check(true, 'בלי רשת: טעינה מחדש מציגה את המעבר');
  const fresh = await ctx.newPage();
  await fresh.goto(BASE);
  await fresh.waitForSelector('#next h1:has-text("טיסה מזויפת")', { timeout: 10000 });
  check(true, 'בלי רשת: פתיחה מחדש של האפליקציה עובדת');
  check(await fresh.isVisible('#arrived .notes:has-text("הערת נחיתה מזויפת")'), 'בלי רשת: "הגעת" מוצג עם ההערות');
  await fresh.click('#next button.doc.has:has-text("כרטיס")');
  await fresh.waitForSelector('#viewer:not([hidden]) img');
  check(await fresh.$eval('#viewer img', (img) => img.complete && img.naturalWidth >= 1000), 'בלי רשת: הכרטיס נפתח');
  await fresh.goBack();
  await fresh.click('#pinned button.doc.has:has-text("דרכון")');
  await fresh.waitForSelector('#viewer:not([hidden]) img');
  check(await fresh.$eval('#viewer img', (img) => img.complete && img.naturalWidth > 0), 'בלי רשת: הדרכון נפתח');
  check(await fresh.isHidden('#viewer-original'), 'לתמונה אין כפתור "קובץ מקורי"');
  await fresh.goBack();
  await fresh.waitForTimeout(300); // הדפדפן משחזר את מיקום הגלילה אחרי "חזרה"
  await fresh.evaluate(() => window.scrollTo(0, 0));
  await fresh.screenshot({ path: `${OUT}/3-offline.png` });
} catch (e) {
  console.error('✗ הבדיקה נעצרה:', e.message);
  failed++;
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nכל הבדיקות עברו');
process.exitCode = failed ? 1 : 0;
