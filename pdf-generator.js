/* ============================================================
   Orthobitto - PDF Export Engine v2.7
   Separate Sentence PDF + Vocabulary PDF
   Robust browser download + selectable English/Bengali fonts
   ============================================================ */

'use strict';

window.OrthobittoPDF = (function () {
  const PAGE = { width: 794, height: 1123 };
  const MARGIN = { left: 62, right: 62, top: 58, bottom: 78 };
  const FOOTER_H = 62;
  const CONTENT_BOTTOM = PAGE.height - MARGIN.bottom - FOOTER_H;
  const CONTENT_HEIGHT = CONTENT_BOTTOM - MARGIN.top;

  const SAFE_FONT_FALLBACKS = {
    eng: ['Inter', 'Arial', 'sans-serif'],
    ben: ['Noto Sans Bengali', 'Hind Siliguri', 'sans-serif']
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cssFont(primary, fallbacks) {
    const clean = String(primary || '').replace(/["']/g, '');
    const names = clean ? [clean, ...fallbacks.filter(x => x.toLowerCase() !== clean.toLowerCase())] : fallbacks;
    return names.map(x => `'${x.replace(/'/g, '')}'`).join(', ');
  }

  function baseStyles(config) {
    const engFamily = cssFont(config.engFont, SAFE_FONT_FALLBACKS.eng);
    const benFamily = cssFont(config.benFont, SAFE_FONT_FALLBACKS.ben);
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page {
        width: ${PAGE.width}px;
        height: ${PAGE.height}px;
        background: #fff;
        color: #000;
        position: relative;
        overflow: hidden;
        padding: ${MARGIN.top}px ${MARGIN.right}px ${MARGIN.bottom + FOOTER_H + 12}px ${MARGIN.left}px;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
      }
      .content {
        height: ${CONTENT_HEIGHT}px;
        overflow: hidden;
      }
      .page-title {
        margin: 0 0 22px;
        padding-bottom: 10px;
        border-bottom: 2px solid #000;
        color: #000;
        font-family: ${engFamily};
        font-size: 30px;
        font-weight: 700;
        line-height: 1.1;
      }
      .subtitle {
        margin: -8px 0 18px;
        color: #000;
        font-family: ${benFamily};
        font-size: 14px;
        line-height: 1.5;
      }
      .sentence-item {
        margin: 0 0 16px;
        padding: 0 0 14px;
        border-bottom: 1px solid #000;
        break-inside: avoid;
      }
      .sentence-en {
        color: #000;
        font-family: ${engFamily};
        font-size: ${Math.max(14, Number(config.engFontSize) + 7)}px;
        font-weight: 500;
        line-height: 1.46;
      }
      .sentence-bn {
        margin-top: 8px;
        color: #000;
        font-family: ${benFamily};
        font-size: ${Math.max(14, Number(config.benFontSize) + 3)}px;
        font-weight: 500;
        line-height: 1.58;
      }
      .vocab-row {
        display: grid;
        grid-template-columns: 52px 1.05fr 1.55fr;
        gap: 18px;
        padding: 11px 0;
        border-bottom: 1px solid #000;
        break-inside: avoid;
      }
      .vocab-num, .vocab-head {
        color: #000;
        font-family: ${benFamily};
        font-size: 13px;
        font-weight: 700;
      }
      .vocab-word {
        color: #000;
        font-family: ${engFamily};
        font-size: ${Math.max(16, Number(config.engFontSize) + 5)}px;
        line-height: 1.25;
        font-weight: 600;
      }
      .vocab-meaning {
        color: #000;
        font-family: ${benFamily};
        font-size: ${Math.max(15, Number(config.benFontSize) + 2)}px;
        line-height: 1.5;
      }
      .table-head {
        display: grid;
        grid-template-columns: 52px 1.05fr 1.55fr;
        gap: 18px;
        padding: 0 0 10px;
        margin-bottom: 2px;
        border-bottom: 2px solid #000;
      }
      .footer-zone {
        position: absolute;
        left: ${MARGIN.left}px;
        right: ${MARGIN.right}px;
        bottom: ${MARGIN.bottom}px;
        height: ${FOOTER_H}px;
        border-top: 2px solid #000;
        padding-top: 8px;
        background: #fff;
        text-align: center;
      }
      .footer-name {
        color: #000;
        font-family: ${engFamily};
        font-size: 16px;
        font-weight: 700;
        line-height: 1.15;
        text-decoration: none;
      }
      .footer-name a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .footer-meta {
        margin-top: 3px;
        color: #000;
        font-family: ${benFamily};
        font-size: 10px;
      }
      .footer-meta a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .page-number {
        position: absolute;
        right: 0;
        bottom: 1px;
        color: #000;
        font-family: Arial, sans-serif;
        font-size: 9px;
      }
    `;
  }

  function makeWrapper(config) {
    const wrapper = document.createElement('div');
    wrapper.id = 'pdf-render-wrapper';
    Object.assign(wrapper.style, {
      position: 'fixed', left: '-100000px', top: '0', width: `${PAGE.width}px`,
      background: '#fff', zIndex: '2147483647', opacity: '1', pointerEvents: 'none'
    });
    const style = document.createElement('style');
    style.textContent = baseStyles(config);
    wrapper.appendChild(style);
    document.body.appendChild(wrapper);
    return wrapper;
  }

  function makePage(config, title, subtitle, bodyHtml, pageNumber) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
      <div class="content">
        <h1 class="page-title">${esc(title)}</h1>
        <div class="subtitle">${esc(subtitle)}</div>
        ${bodyHtml}
      </div>
      <div class="footer-zone">
        <div class="footer-name"><a href="https://www.facebook.com/OmarMohammadChowdhury">Omar Mohammad Chowdhury</a></div>
        <div class="footer-meta"><a href="https://www.facebook.com/OmarMohammadChowdhury">Facebook Profile</a> · Orthobitto Learning PDF</div>
        <div class="page-number">Page ${pageNumber}</div>
      </div>
    `;
    return page;
  }

  async function ensureScript(src, globalName) {
    if (globalName.split('.').reduce((obj, key) => obj?.[key], window)) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-orthobitto-lib="${globalName}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Could not load ${globalName}.`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.orthobittoLib = globalName;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${globalName}.`));
      document.head.appendChild(script);
    });
  }

  async function ensureLibraries() {
    await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
    await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
    if (!window.jspdf?.jsPDF) throw new Error('PDF library could not be initialized.');
    if (typeof window.html2canvas !== 'function') throw new Error('PDF renderer could not be initialized.');
  }

  async function waitForFonts(config) {
    const families = [config.engFont, config.benFont].filter(Boolean);
    if (document.fonts?.load) {
      for (const family of families) {
        try {
          await document.fonts.load(`20px "${String(family).replace(/"/g, '')}"`);
        } catch (_) {}
      }
    }
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
  }

  async function renderPage(page, config) {
    await waitForFonts(config);
    return window.html2canvas(page, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageSmoothingEnabled: true,
      removeContainer: true
    });
  }

  function showDownloadReady(pdf, filename) {
    const old = document.getElementById('orthobitto-pdf-download-ready');
    if (old) old.remove();

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    const overlay = document.createElement('div');
    overlay.id = 'orthobitto-pdf-download-ready';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'background:rgba(15,14,26,.62)',
      'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)'
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'width:min(460px,100%)', 'background:#fff', 'color:#0f0e1a',
      'border-radius:18px', 'padding:24px',
      'box-shadow:0 20px 70px rgba(0,0,0,.28)',
      'font-family:Inter,Arial,sans-serif', 'text-align:center'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'PDF Ready';
    title.style.cssText = 'font-size:20px;font-weight:800;margin-bottom:8px';

    const msg = document.createElement('div');
    msg.textContent = 'The PDF has been generated. Click the button below to download it.';
    msg.style.cssText = 'font-size:14px;line-height:1.6;color:#4a4b6a;margin-bottom:18px';

    const download = document.createElement('a');
    download.href = url;
    download.download = filename;
    download.textContent = `Download ${filename}`;
    download.setAttribute('aria-label', `Download ${filename}`);
    download.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center',
      'min-height:46px', 'padding:0 20px', 'border-radius:12px',
      'background:linear-gradient(135deg,#6c63ff 0%,#3b82f6 100%)',
      'color:#fff', 'font-weight:800', 'text-decoration:none', 'cursor:pointer'
    ].join(';');

    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.textContent = 'Open PDF';
    fallback.style.cssText = [
      'display:inline-flex', 'align-items:center', 'justify-content:center',
      'min-height:46px', 'padding:0 20px', 'margin-left:10px',
      'border-radius:12px', 'border:1px solid #d9d8ea',
      'background:#fff', 'color:#0f0e1a', 'font-weight:700', 'cursor:pointer'
    ].join(';');
    fallback.onclick = () => {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) window.location.href = url;
    };

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'display:block;margin:16px auto 0;border:0;background:transparent;color:#6c63ff;font-weight:700;cursor:pointer';
    close.onclick = () => {
      overlay.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    download.addEventListener('click', () => {
      setTimeout(() => {
        overlay.remove();
        URL.revokeObjectURL(url);
      }, 700);
    }, { once: true });

    card.append(title, msg, download, fallback, close);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Best-effort one-click attempt. Browser policy may block async programmatic downloads;
    // the visible user-gesture download link above remains available and reliable.
    setTimeout(() => {
      try { download.click(); } catch (_) {}
    }, 50);

    return url;
  }

  function createBodyHtml(config, source, start, end) {
    const chunk = source.slice(start, end);
    if (config.mode === 'vocab') {
      let bodyHtml = `<div class="table-head"><div class="vocab-head">#</div><div class="vocab-head">English Word</div><div class="vocab-head">Bengali Meaning</div></div>`;
      bodyHtml += chunk.map((item, idx) => `
        <div class="vocab-row">
          <div class="vocab-num">${start + idx + 1}</div>
          <div class="vocab-word">${esc(item.word)}</div>
          <div class="vocab-meaning">${esc(item.meaning)}</div>
        </div>
      `).join('');
      return bodyHtml;
    }
    return chunk.map(item => `
      <div class="sentence-item">
        <div class="sentence-en">${esc(item.en)}</div>
        <div class="sentence-bn">${esc(item.bn)}</div>
      </div>
    `).join('');
  }

  function pageFits(page) {
    const content = page.querySelector('.content');
    return content && content.scrollHeight <= CONTENT_HEIGHT + 2;
  }

  async function buildPages(config) {
    const wrapper = makeWrapper(config);
    const pages = [];
    const source = config.mode === 'vocab' ? config.vocab : config.sentences;
    const title = config.mode === 'vocab' ? 'Orthobitto Vocabulary' : 'Orthobitto Sentences';
    const subtitle = config.mode === 'vocab'
      ? 'English words and approved Bengali meanings'
      : 'English sentences and Bengali translations';

    if (!Array.isArray(source) || !source.length) {
      throw new Error('No content available for PDF export.');
    }

    // Greedy height-aware pagination: keep adding items while the current page
    // physically fits. This avoids the old fixed 7/18-item pagination that left
    // large blank areas at the bottom of pages.
    let cursor = 0;
    while (cursor < source.length) {
      let end = cursor + 1;
      let bestEnd = end;

      while (end <= source.length) {
        const bodyHtml = createBodyHtml(config, source, cursor, end);
        const probe = makePage(config, title, subtitle, bodyHtml, pages.length + 1);
        wrapper.appendChild(probe);
        const fits = pageFits(probe);
        probe.remove();

        if (!fits) {
          break;
        }
        bestEnd = end;
        end += 1;
      }

      // Always consume at least one item, even if one unusually large item
      // exceeds the page height on its own.
      if (bestEnd === cursor) bestEnd = cursor + 1;

      const finalHtml = createBodyHtml(config, source, cursor, bestEnd);
      const finalPage = makePage(config, title, subtitle, finalHtml, pages.length + 1);
      wrapper.appendChild(finalPage);
      pages.push(finalPage);
      cursor = bestEnd;
    }

    pages.forEach((p, idx) => {
      const n = p.querySelector('.page-number');
      if (n) n.textContent = `Page ${idx + 1}`;
    });

    return { wrapper, pages };
  }

  function addPdfLinkAnnotation(pdf, page, selector, href) {
    if (!pdf?.link || !page || !href) return;
    const target = page.querySelector(selector);
    if (!target) return;

    const pageRect = page.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (!pageRect.width || !pageRect.height || !rect.width || !rect.height) return;

    const mmX = rect.left - pageRect.left;
    const mmY = rect.top - pageRect.top;
    const scaleX = 210 / pageRect.width;
    const scaleY = 297 / pageRect.height;
    const x = Math.max(0, mmX * scaleX - 1.5);
    const y = Math.max(0, mmY * scaleY - 1.5);
    const w = Math.max(8, rect.width * scaleX + 3);
    const h = Math.max(4, rect.height * scaleY + 3);
    pdf.link(x, y, w, h, { url: href });
  }

  async function generate(config) {
    let wrapper = null;
    try {
      await ensureLibraries();
      const built = await buildPages(config);
      wrapper = built.wrapper;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

      for (let i = 0; i < built.pages.length; i++) {
        const canvas = await renderPage(built.pages[i], config);
        if (i > 0) pdf.addPage();
        const img = canvas.toDataURL('image/png');
        pdf.addImage(img, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        addPdfLinkAnnotation(pdf, built.pages[i], '.footer-name a', 'https://www.facebook.com/OmarMohammadChowdhury');
        addPdfLinkAnnotation(pdf, built.pages[i], '.footer-meta a', 'https://www.facebook.com/OmarMohammadChowdhury');
      }

      const date = new Date().toISOString().slice(0, 10);
      const filename = config.mode === 'vocab'
        ? `Orthobitto_Vocabulary_${date}.pdf`
        : `Orthobitto_Sentences_${date}.pdf`;

      showDownloadReady(pdf, filename);
      const pdfModal = document.getElementById('pdf-modal');
      if (pdfModal) pdfModal.hidden = true;
      window.showToast?.('PDF Ready', `${config.mode === 'vocab' ? 'Vocabulary' : 'Sentence'} PDF download started.`, 'success');
      return true;
    } catch (err) {
      console.error('[PDF Generator Error]', err);
      window.showToast?.('PDF Error', err?.message || 'Could not generate PDF.', 'error', 7000);
      return false;
    } finally {
      if (wrapper?.parentElement) wrapper.remove();
    }
  }

  return { generate };
})();
