// הופך PDF לתמונות ברגע ההעלאה, כדי שהמסמך ייפתח מהר, בלי רשת, ועם QR חד.
const BASE = new URL('./vendor/pdfjs/', import.meta.url).href;

export async function pdfToImages(file, { maxPages = 10, targetWidth = 1600 } = {}) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.mjs';
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    cMapUrl: BASE + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: BASE + 'standard_fonts/',
  }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const scale = Math.min(targetWidth / page.getViewport({ scale: 1 }).width, 4);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push(await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92)));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
