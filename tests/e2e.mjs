// בדיקת קצה לקצה בגודל טלפון: ייבוא, מסמכים, טופס, ואז בלי רשת.
// כל המידע כאן מזויף. צילומי מסך נשמרים ב-E2E_OUT (ברירת מחדל: test-results/).
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
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
const server = await serve(PORT);
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
  check(await page.isVisible('text=אין מעברים קרובים'), 'מסך ריק מסביר מה לעשות');

  // ייבוא, עטוף ב-``` כמו שמעתיקים מהצ'אט
  const now = Date.now();
  const data = {
    transitions: [
      { id: 'f1', title: 'טיסה מזויפת', start: iso(now + 3 * H, 345), end: iso(now + 8 * H, 480),
        from: 'עיר א', to: 'עיר ב', notes: 'להגיע שעתיים לפני.\nמזוודה אחת.', docs: ['כרטיס', 'דרכון'] },
      { id: 'f2', title: 'טיסה שנייה', start: iso(now + 20 * H, 480), end: iso(now + 22 * H, 420), docs: ['כרטיס'] },
      { id: 'old', title: 'מעבר שעבר', start: iso(now - 30 * H, 0), end: iso(now - 20 * H, 0) },
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

  // בלי רשת: טעינה מחדש, וגם פתיחה בלשונית חדשה (כמו מהמסך הבית)
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#next h1:has-text("טיסה מזויפת")', { timeout: 10000 });
  check(true, 'בלי רשת: טעינה מחדש מציגה את המעבר');
  const fresh = await ctx.newPage();
  await fresh.goto(BASE);
  await fresh.waitForSelector('#next h1:has-text("טיסה מזויפת")', { timeout: 10000 });
  check(true, 'בלי רשת: פתיחה מחדש של האפליקציה עובדת');
  await fresh.click('#next button.doc.has:has-text("כרטיס")');
  await fresh.waitForSelector('#viewer:not([hidden]) img');
  check(await fresh.$eval('#viewer img', (img) => img.complete && img.naturalWidth >= 1000), 'בלי רשת: הכרטיס נפתח');
  await fresh.goBack();
  await fresh.click('#pinned button.doc.has:has-text("דרכון")');
  await fresh.waitForSelector('#viewer:not([hidden]) img');
  check(await fresh.$eval('#viewer img', (img) => img.complete && img.naturalWidth > 0), 'בלי רשת: הדרכון נפתח');
  check(await fresh.isHidden('#viewer-original'), 'לתמונה אין כפתור "קובץ מקורי"');
  await fresh.goBack();
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
