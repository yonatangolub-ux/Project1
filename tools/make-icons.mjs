// מייצר את האייקונים של האפליקציה (icons/*.png) מ-SVG, עם Chromium של Playwright.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// רקע מלא (כדי שיעבוד גם כאייקון maskable), והציור בתוך 60% האמצעיים
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1d3557"/>
  <rect x="166" y="132" width="180" height="248" rx="22" fill="#f6f3ee"/>
  <rect x="166" y="132" width="180" height="62" rx="22" fill="#e9c46a"/>
  <rect x="166" y="170" width="180" height="24" fill="#e9c46a"/>
  <rect x="196" y="226" width="120" height="14" rx="7" fill="#1d3557"/>
  <rect x="196" y="258" width="90" height="14" rx="7" fill="#1d3557" opacity=".55"/>
  <rect x="196" y="300" width="56" height="56" rx="6" fill="none" stroke="#1d3557" stroke-width="10"/>
  <rect x="214" y="318" width="20" height="20" fill="#1d3557"/>
</svg>`;

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `icons/icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log('icons/icon-192.png, icons/icon-512.png');
