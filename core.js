// לוגיקה טהורה: בלי DOM ובלי אחסון, כדי שאפשר לבדוק הכול (tests/core.test.mjs).

export const GRACE_MS = 6 * 3600 * 1000; // מעבר בלי שעת הגעה פעיל 6 שעות אחרי היציאה

const OFFSET_RE = /(Z|[+-]\d\d:\d\d)$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const toMs = (iso) => Date.parse(iso);

export function activeUntil(t) {
  return t.end ? toMs(t.end) : toMs(t.start) + GRACE_MS;
}

// מחזיר את המעבר הבא ואת אלה שאחריו. מעבר שעבר נעלם לבד.
export function splitTransitions(list, nowMs) {
  const active = list
    .filter((t) => activeUntil(t) > nowMs)
    .sort((a, b) => toMs(a.start) - toMs(b.start));
  return { next: active[0] || null, later: active.slice(1) };
}

// השעה לפי השעון של המקום שכתוב במחרוזת, לא לפי השעון של הטלפון.
export function formatLocal(iso) {
  const m = LOCAL_RE.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  const day = new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay();
  return `יום ${HEB_DAYS[day]} ${+d}.${+mo} · ${h}:${mi}`;
}

export function untilText(diffMs) {
  const totalMin = Math.floor(diffMs / 60000);
  if (totalMin < 1) return 'בעוד פחות מדקה';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days >= 2) return `בעוד ${days} ימים`;
  if (days === 1) return hours ? `בעוד יום ו-${hours === 1 ? 'שעה' : hours + ' שעות'}` : 'בעוד יום';
  if (hours >= 1) {
    const hText = hours === 1 ? 'שעה' : `${hours} שעות`;
    return mins ? `בעוד ${hText} ו-${mins} דק׳` : `בעוד ${hText}`;
  }
  return `בעוד ${mins} דק׳`;
}

export function statusText(t, nowMs) {
  const start = toMs(t.start);
  return nowMs < start ? untilText(start - nowMs) : 'עכשיו, בדרך';
}

export function offsetString(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (n) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// "2030-01-10T19:00" + דקות היסט → מחרוזת ISO עם אזור זמן
export function withOffset(localValue, offsetMinutes) {
  return `${localValue.slice(0, 16)}:00${offsetString(offsetMinutes)}`;
}

export function toLocalInputValue(iso) {
  const m = LOCAL_RE.exec(iso || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
}

export function offsetOf(iso) {
  const m = OFFSET_RE.exec(iso || '');
  if (!m) return null;
  return m[1] === 'Z' ? '+00:00' : m[1];
}

export function offsetMinutesOf(iso) {
  const o = offsetOf(iso);
  if (!o) return null;
  const sign = o[0] === '-' ? -1 : 1;
  return sign * (+o.slice(1, 3) * 60 + +o.slice(4, 6));
}

export function docNamesFromText(text) {
  const names = (text || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(names)];
}

function validDate(iso) {
  return typeof iso === 'string' && OFFSET_RE.test(iso) && LOCAL_RE.test(iso) && !Number.isNaN(toMs(iso));
}

const strList = (v) => Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()))] : [];

// קורא קוד ייבוא. זורק Error עם הודעה בעברית אם משהו לא תקין.
export function parseImport(text) {
  const clean = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  let data;
  try {
    data = JSON.parse(clean);
  } catch {
    throw new Error('לא הצלחתי לקרוא את הקוד. צריך להדביק את כל הקוד בדיוק כמו שקיבלת אותו.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || (!Array.isArray(data.transitions) && !Array.isArray(data.pinned))) {
    throw new Error('חסר בקוד "transitions" או "pinned".');
  }
  const transitions = (data.transitions || []).map((t, i) => {
    const n = `מעבר ${i + 1}`;
    if (!t || typeof t !== 'object') throw new Error(`${n}: לא תקין.`);
    if (!t.id || typeof t.id !== 'string') throw new Error(`${n}: חסר id.`);
    if (!t.title || typeof t.title !== 'string') throw new Error(`${n}: חסרה כותרת.`);
    if (!validDate(t.start)) throw new Error(`${n}: שעת יציאה לא תקינה. צריך תאריך, שעה ואזור זמן (למשל 2030-01-10T16:05:00+05:45).`);
    if (t.end !== undefined && t.end !== null && t.end !== '') {
      if (!validDate(t.end)) throw new Error(`${n}: שעת הגעה לא תקינה. צריך תאריך, שעה ואזור זמן.`);
      if (toMs(t.end) < toMs(t.start)) throw new Error(`${n}: ההגעה לפני היציאה.`);
    }
    const out = { id: t.id, title: t.title.trim(), start: t.start };
    if (t.end) out.end = t.end;
    for (const k of ['from', 'to', 'notes']) if (typeof t[k] === 'string' && t[k].trim()) out[k] = t[k].trim();
    out.docs = strList(t.docs);
    return out;
  });
  return { transitions, pinned: strList(data.pinned) };
}
