/* 分享與列印 — 依賴 app.js 全域狀態與工具函式 */

function formatDayEventsText(t, day, dayIdx) {
    const header = `${formatBannerDayLabel(t, day, dayIdx)} · ${day.title}`;
    const events = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
    if (events.length === 0) return `${header}\n（未有景點）`;
    const lines = events.map(({ ev }) => {
        let line = `${ev.time || '--:--'}  ${ev.loc || '景點'}`;
        if (ev.bookingRef) line += ` [${ev.bookingRef}]`;
        if (ev.remark) line += `\n    ${ev.remark.replace(/\n/g, '\n    ')}`;
        return line;
    });
    return `${header}\n${lines.join('\n')}`;
}

function formatTripText(t) {
    const parts = [`📋 ${t.name}`];
    if (t.city) parts.push(`📍 ${t.city}`);
    if (t.startDate) parts.push(`📅 出發：${t.startDate}`);
    parts.push('');
    t.itinerary.forEach((day, idx) => {
        parts.push(formatDayEventsText(t, day, idx));
        parts.push('');
    });
    const checklist = getTripChecklist(t);
    if (checklist.length) {
        const done = checklist.filter((c) => c.done).length;
        parts.push(`🧳 行李清單（${done}/${checklist.length}）`);
        checklist.forEach((c) => {
            parts.push(`${c.done ? '☑' : '☐'} ${c.task}`);
        });
    }
    return parts.join('\n').trim();
}

async function sharePlainText(title, text) {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            showToast('已分享');
            return;
        } catch (err) {
            if (err?.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('已複製到剪貼簿');
    } catch (_) {
        await modalAlert('分享失敗', '請手動複製內容');
    }
}

function shareCurrentTrip() {
    sharePlainText(trip.name, formatTripText(trip));
}

function getTripChecklist(t) {
    if (!t || !Array.isArray(t.checklist)) return [];
    return t.checklist.map((c) => ({
        task: c?.task != null ? String(c.task) : c?.text != null ? String(c.text) : '',
        done: !!c?.done,
    }));
}

function buildChecklistPrintSection(t) {
    const items = getTripChecklist(t);
    if (!items.length) {
        return '<section class="day checklist"><h2>行李清單</h2><p class="muted">尚無項目</p></section>';
    }
    const done = items.filter((c) => c.done).length;
    const rows = items
        .map(
            (c) =>
                `<li class="check-item${c.done ? ' check-done' : ''}"><span class="check-box" aria-hidden="true">${c.done ? '☑' : '☐'}</span><span>${escapeHtml(c.task || '（未命名）')}</span></li>`,
        )
        .join('');
    return `<section class="day checklist" id="print-checklist"><h2>行李清單 <span class="tag">${done}/${items.length} 已完成</span></h2><ul class="checklist-list">${rows}</ul></section>`;
}

function buildPrintHtml(t) {
    const days = t.itinerary
        .map((day, idx) => {
            const events = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
            const eventHtml =
                events.length === 0
                    ? '<p class="muted">未有景點</p>'
                    : events
                          .map(({ ev }) => {
                              const bits = [
                                  ev.time ? `<strong>${escapeHtml(ev.time)}</strong>` : '',
                                  escapeHtml(ev.loc || '景點'),
                                  ev.bookingRef ? `<span class="tag">訂位 ${escapeHtml(ev.bookingRef)}</span>` : '',
                                  ev.cost !== '' && ev.cost != null && !Number.isNaN(Number(ev.cost))
                                      ? `<span class="tag">${escapeHtml(formatAmount(ev.cost))}</span>`
                                      : '',
                              ]
                                  .filter(Boolean)
                                  .join(' · ');
                              const remark = ev.remark ? `<p class="remark">${escapeHtml(ev.remark)}</p>` : '';
                              return `<li>${bits}${remark}</li>`;
                          })
                          .join('');
            return `<section class="day"><h2>${escapeHtml(formatBannerDayLabel(t, day, idx))} — ${escapeHtml(day.title)}</h2><ul>${eventHtml}</ul></section>`;
        })
        .join('');
    const checklist = buildChecklistPrintSection(t);
    return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>${escapeHtml(t.name)}</title>
<style>
body{font-family:'Noto Sans TC',sans-serif;color:#2D3436;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px} .meta{color:#666;font-size:13px;margin-bottom:20px}
.day{margin-bottom:20px;page-break-inside:avoid} h2{font-size:15px;border-bottom:2px solid #FF85A1;padding-bottom:4px}
ul{list-style:none;padding:0;margin:8px 0 0} li{margin:8px 0;font-size:13px;line-height:1.5}
.remark{color:#666;font-size:12px;margin:4px 0 0;white-space:pre-line} .tag{color:#FF85A1;font-size:11px} .muted{color:#999}
.checklist{margin-bottom:24px}
.checklist-list li.check-item{display:flex;gap:8px;align-items:flex-start;margin:6px 0}
.check-done{opacity:.55;text-decoration:line-through}
.check-box{flex-shrink:0;font-size:14px;line-height:1.4}
@media print{
body{padding:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.checklist{page-break-inside:avoid}
.day{page-break-inside:avoid}
}
</style></head><body>
<h1>${escapeHtml(t.name)}</h1>
<p class="meta">${escapeHtml(t.city || '')}${t.startDate ? ` · 出發 ${escapeHtml(t.startDate)}` : ''}</p>
${checklist}
${days}
<p class="muted" style="margin-top:24px;font-size:11px">由「旅行筆記」匯出 · ${new Date().toLocaleString('zh-TW')}</p>
</body></html>`;
}

// 預覽緊嘅 HTML（行程或遊記），列印時用返同一份
let printPreviewHtml = '';

function showPrintPreview(titleText, html) {
    const overlay = document.getElementById('print-preview');
    const frame = document.getElementById('print-preview-frame');
    if (!overlay || !frame) return;
    printPreviewHtml = html;
    const title = document.querySelector('.print-preview-title');
    if (title) title.textContent = titleText;
    overlay.classList.remove('hidden');
    frame.srcdoc = html;
}

function printCurrentTrip() {
    if (typeof flushSave === 'function') flushSave();
    showPrintPreview(trip.name || '行程預覽', buildPrintHtml(trip));
}

function closePrintPreview() {
    const frame = document.getElementById('print-preview-frame');
    if (frame) frame.removeAttribute('srcdoc');
    printPreviewHtml = '';
    document.getElementById('print-preview')?.classList.add('hidden');
}

function runPrintPreview() {
    if (typeof flushSave === 'function') flushSave();
    const html = printPreviewHtml || buildPrintHtml(trip);
    const w = window.open('', '_blank');
    if (!w) {
        const frame = document.getElementById('print-preview-frame');
        try {
            frame?.contentWindow?.focus();
            frame?.contentWindow?.print();
        } catch (_) {
            modalAlert('無法列印', '請允許彈出視窗後再試');
        }
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
        try {
            w.print();
        } catch (_) {
            modalAlert('無法列印', '請稍後再試');
        }
    }, 350);
}

// ── PDF 分享：用列印版面影相成 A4 PDF，再彈手機分享選單 ──
const PDF_LIBS = ['vendor/pdf/html2canvas.min.js', 'vendor/pdf/jspdf.umd.min.js'];
const PDF_PAGE_CSS_WIDTH = 768;
let pdfBusy = false;

function loadScriptOnce(src) {
    if (document.querySelector(`script[data-src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.dataset.src = src;
        s.onload = resolve;
        s.onerror = () => {
            s.remove();
            reject(new Error('載入 PDF 工具失敗'));
        };
        document.head.appendChild(s);
    });
}

async function renderPrintHtmlToCanvas(html) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PDF_PAGE_CSS_WIDTH}px;height:1000px;border:0;background:#fff`;
    document.body.appendChild(frame);
    try {
        await new Promise((resolve) => {
            frame.onload = resolve;
            frame.srcdoc = html;
        });
        const doc = frame.contentDocument;
        if (doc.fonts?.ready) await doc.fonts.ready;
        const body = doc.body;
        body.style.background = '#fff';
        frame.style.height = `${body.scrollHeight + 40}px`;
        // 每個區塊底部係安全切頁位
        const cuts = Array.from(body.children).map((el) => el.offsetTop + el.offsetHeight);
        const canvas = await window.html2canvas(body, {
            scale: 2,
            backgroundColor: '#ffffff',
            windowWidth: PDF_PAGE_CSS_WIDTH,
            logging: false,
        });
        return { canvas, cuts, cssHeight: body.scrollHeight };
    } finally {
        frame.remove();
    }
}

async function buildTripPdfFile(t) {
    for (const src of PDF_LIBS) await loadScriptOnce(src);
    const { canvas, cuts, cssHeight } = await renderPrintHtmlToCanvas(buildPrintHtml(t));
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 10;
    const pageW = 210 - margin * 2;
    const mmPerCss = pageW / PDF_PAGE_CSS_WIDTH;
    const pageCss = (297 - margin * 2) / mmPerCss;
    const ratio = canvas.width / PDF_PAGE_CSS_WIDTH;
    let y = 0;
    let first = true;
    while (y < cssHeight - 1) {
        const limit = y + pageCss;
        // 喺頁底之前搵最後一個區塊尾切；一個區塊長過一頁先硬切
        const fit = cuts.filter((c) => c > y + 1 && c <= limit);
        const end = limit >= cssHeight ? cssHeight : fit.length ? Math.max(...fit) : limit;
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.ceil((end - y) * ratio);
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, Math.floor(y * ratio), slice.width, slice.height, 0, 0, slice.width, slice.height);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, pageW, (end - y) * mmPerCss);
        first = false;
        y = end;
    }
    const safeName = (t.name || '行程').replace(/[\/:*?"<>|]/g, '').trim() || '行程';
    return new File([pdf.output('blob')], `${safeName}.pdf`, { type: 'application/pdf' });
}

function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareTripPdf() {
    if (pdfBusy) return;
    pdfBusy = true;
    const btn = document.getElementById('trip-pdf-btn');
    btn?.classList.add('is-busy');
    btn?.setAttribute('aria-busy', 'true');
    try {
        if (typeof flushSave === 'function') flushSave();
        showToast('整緊 PDF…');
        const file = await buildTripPdfFile(trip);
        if (!navigator.canShare?.({ files: [file] })) {
            downloadFile(file);
            showToast('已下載 PDF');
            return;
        }
        try {
            await navigator.share({ files: [file], title: trip.name });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            // 整 PDF 太耐，手機當咗唔係用戶撳 → 再撳一下就得
            if (err?.name !== 'NotAllowedError') throw err;
            if (!(await modalConfirm('PDF 整好咗 📄', '撳「分享」傳畀朋友', { confirmText: '分享' }))) return;
            await navigator.share({ files: [file], title: trip.name }).catch((e) => {
                if (e?.name !== 'AbortError') throw e;
            });
        }
    } catch (err) {
        await modalAlert('PDF 失敗', err?.message || '請稍後再試');
    } finally {
        pdfBusy = false;
        btn?.classList.remove('is-busy');
        btn?.removeAttribute('aria-busy');
    }
}
