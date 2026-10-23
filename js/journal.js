/* 想去清單 + 每日感想 + 遊記 PDF；依賴 app.js 全域狀態與工具函式 */

let wishlistOpen = false;

function tripWishlist() {
    if (!Array.isArray(trip.wishlist)) trip.wishlist = [];
    return trip.wishlist;
}

function dayJournal(day) {
    if (!day.journal) day.journal = migrateJournal(null);
    return day.journal;
}

/* ── 想去清單 ── */

function toggleWishlist() {
    wishlistOpen = !wishlistOpen;
    renderWishlist();
}

function renderWishlist() {
    const card = document.getElementById('wishlist-card');
    if (!card) return;
    const list = tripWishlist();
    const editing = isEdit && !travelMode;
    card.classList.toggle('hidden', editing || (travelMode && !list.length));
    document.getElementById('wishlist-count').textContent = list.length ? String(list.length) : '';
    const head = document.getElementById('wishlist-head');
    head?.setAttribute('aria-expanded', wishlistOpen ? 'true' : 'false');
    head?.classList.toggle('is-open', wishlistOpen);
    document.getElementById('wishlist-body')?.classList.toggle('hidden', !wishlistOpen);
    document.getElementById('wishlist-add')?.classList.toggle('hidden', travelMode);
    if (!wishlistOpen) return;
    const dayLabel = trip.itinerary[curDayIdx] ? dayCardLines(trip, curDayIdx).line1 : '';
    const el = document.getElementById('wishlist-list');
    el.innerHTML = list.length
        ? list
              .map(
                  (w, i) => `<div class="wish-row">
                <div class="wish-row-main">
                    <p class="wish-row-loc">${escapeHtml(w.loc)}</p>
                    ${w.remark ? `<p class="wish-row-remark">${escapeHtml(w.remark)}</p>` : ''}
                </div>
                <button type="button" class="wish-schedule-btn" onclick="scheduleWish(${i})">排入 ${escapeHtml(dayLabel)}</button>
                <button type="button" class="wish-del-btn" onclick="removeWish(${i})" aria-label="刪除「${escapeAttr(w.loc)}」"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>`,
              )
              .join('')
        : '<p class="type-caption text-muted">未有想去嘅地方 (｡•ᴗ•｡)　諗到就加，之後先排入日子</p>';
}

function addWish() {
    const input = document.getElementById('wishlist-input');
    const loc = (input?.value || '').trim();
    if (!loc) return;
    tripWishlist().push(migrateWish({ loc }));
    input.value = '';
    save();
    renderWishlist();
}

function removeWish(i) {
    tripWishlist().splice(i, 1);
    save();
    renderWishlist();
}

async function scheduleWish(i) {
    const day = trip.itinerary[curDayIdx];
    const w = tripWishlist()[i];
    if (!day || !w) return;
    tripWishlist().splice(i, 1);
    // 時間留空：排喺當日最尾，之後喺編輯模式再定
    day.events.push(migrateEvent({ loc: w.loc, remark: w.remark, link: w.link, tag: w.tag, time: '' }));
    save();
    renderDaySelector();
    await renderDay(curDayIdx);
    showToast(`已排入 ${dayCardLines(trip, curDayIdx).line1}（時間未定）`);
}

async function moveEventToWishlist(dayIdx, i) {
    const day = trip.itinerary[dayIdx];
    const ev = day?.events[i];
    if (!ev) return;
    if (typeof closeEventEditSheet === 'function') closeEventEditSheet({ silent: true });
    tripWishlist().push(migrateWish(ev));
    if (isIdbRef(ev.img)) await deleteImageRef(ev.img);
    day.events.splice(i, 1);
    save();
    wishlistOpen = true;
    renderDaySelector();
    await renderDay(dayIdx);
    showToast('已移去想去清單');
}

/* ── 每日感想 ── */

async function renderDayJournal(idx) {
    const el = document.getElementById('day-journal');
    const day = trip.itinerary[idx];
    if (!el || !day) return;
    if (isEdit && !travelMode) {
        el.classList.add('hidden');
        return;
    }
    el.classList.remove('hidden');
    const j = dayJournal(day);
    const textarea = document.getElementById('journal-text');
    // 打緊字就唔好覆寫
    if (textarea && !(document.activeElement === textarea && textarea.dataset.dayIdx === String(idx))) {
        textarea.value = j.text;
        textarea.dataset.dayIdx = String(idx);
    }
    const grid = document.getElementById('journal-photos');
    if (!grid) return;
    const urls = await Promise.all(j.photos.map((ref) => resolveImageUrl(ref)));
    if (idx !== curDayIdx) return;
    grid.innerHTML = j.photos
        .map(
            (ref, i) => `<div class="journal-photo">
            <button type="button" class="journal-photo-img" data-ref="${escapeAttr(ref)}" onclick="showBig(this.dataset.ref)"><img src="${escapeAttr(urls[i] || '')}" alt="感想相片 ${i + 1}"></button>
            <button type="button" class="journal-photo-del" onclick="removeJournalPhoto(${idx}, ${i})" aria-label="刪除相片"><i class="fas fa-times" aria-hidden="true"></i></button>
        </div>`,
        )
        .join('');
    grid.classList.toggle('hidden', !j.photos.length);
}

function onJournalInput(textarea) {
    const idx = parseInt(textarea.dataset.dayIdx, 10);
    const day = trip.itinerary[Number.isFinite(idx) ? idx : curDayIdx];
    if (!day) return;
    dayJournal(day).text = textarea.value;
    debouncedSave();
}

async function removeJournalPhoto(dayIdx, i) {
    const day = trip.itinerary[dayIdx];
    const ref = day?.journal?.photos[i];
    if (!ref) return;
    if (!(await modalConfirm('刪除相片', '確定刪除呢張相？', { danger: true, confirmText: '刪除' }))) return;
    day.journal.photos.splice(i, 1);
    await deleteImageRef(ref);
    save();
    renderDayJournal(dayIdx);
}

document.getElementById('journal-img-input')?.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const dayIdx = curDayIdx;
    const day = trip.itinerary[dayIdx];
    if (!files.length || !day) return;
    try {
        for (const f of files) {
            dayJournal(day).photos.push(await storeImage(await compress(f)));
        }
        save();
        await renderDayJournal(dayIdx);
        updateStorageEstimate();
    } catch (err) {
        save();
        await modalAlert('上傳失敗', err.message || '上傳失敗');
    }
});

/* ── 遊記 PDF ── */

async function buildJournalPrintHtml(t) {
    const sections = [];
    for (let idx = 0; idx < t.itinerary.length; idx++) {
        const day = t.itinerary[idx];
        const j = day.journal || migrateJournal(null);
        const events = sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
        if (!j.text.trim() && !j.photos.length && !events.length) continue;
        const photos = (await Promise.all(j.photos.map((ref) => resolveImageUrl(ref)))).filter(Boolean);
        const spent = sumExpenses(dayExpenses(day));
        const route = events.map(({ ev }) => escapeHtml(ev.loc || '景點')).join(' → ');
        sections.push(`<section class="day">
            <h2>${escapeHtml(formatBannerDayLabel(t, day, idx))}${day.title ? ` — ${escapeHtml(day.title)}` : ''}</h2>
            ${route ? `<p class="route">${route}</p>` : ''}
            ${j.text.trim() ? `<p class="text">${escapeHtml(j.text.trim()).replace(/\n/g, '<br>')}</p>` : ''}
            ${photos.length ? `<div class="photos">${photos.map((u) => `<img src="${escapeAttr(u)}" alt="">`).join('')}</div>` : ''}
            ${spent > 0 ? `<p class="spent">當日花費 ${escapeHtml(formatMoney(spent))}</p>` : ''}
        </section>`);
    }
    const total = tripActualTotal();
    return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>${escapeHtml(t.name)} 遊記</title>
<style>
body{font-family:'Noto Sans TC',sans-serif;color:#2D3436;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px;color:#FF85A1} .meta{color:#666;font-size:13px;margin-bottom:24px}
.day{margin-bottom:28px;page-break-inside:avoid} h2{font-size:16px;border-bottom:2px solid #FF85A1;padding-bottom:4px;margin-bottom:8px}
.route{color:#888;font-size:12px;margin:0 0 10px} .text{font-size:14px;line-height:1.8;margin:0 0 12px}
.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px} .photos img{width:100%;border-radius:10px;object-fit:cover;aspect-ratio:4/3}
.spent{color:#FF85A1;font-size:12px;margin:10px 0 0} .muted{color:#999}
@media print{body{padding:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.day{page-break-inside:avoid}}
</style></head><body>
<h1>📔 ${escapeHtml(t.name)}</h1>
<p class="meta">${escapeHtml(formatTripScheduleRange() || '')}${total > 0 ? ` · 總花費 ${escapeHtml(formatMoney(total))}` : ''}</p>
${sections.join('') || '<p class="muted">未有內容。喺行程頁每日最底寫感想、加相。</p>'}
<p class="muted" style="margin-top:24px;font-size:11px">由「旅行筆記」匯出 · ${new Date().toLocaleString('zh-TW')}</p>
</body></html>`;
}

async function printJournal() {
    if (typeof flushSave === 'function') flushSave();
    showPrintPreview(`${trip.name || '旅程'} 遊記`, await buildJournalPrintHtml(trip));
}
