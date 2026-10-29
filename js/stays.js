/* 住宿 — 跨日嘅酒店／民宿；依賴 app.js 全域狀態與工具函式 */

let _stayEditIdx = null;

function tripStays() {
    if (!Array.isArray(trip.stays)) trip.stays = [];
    return trip.stays;
}

function stayCheckoutIdx(s) {
    return s.startIdx + s.nights;
}

function stayDayLabel(idx) {
    if (trip.itinerary[idx]) return weatherDaySelectLabel(idx);
    if (trip.startDate) {
        const d = addDaysFromIso(trip.startDate, idx);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `第 ${idx + 1} 日`;
}

function staysForDay(idx) {
    const list = tripStays();
    return {
        tonight: list.findIndex((s) => idx >= s.startIdx && idx < stayCheckoutIdx(s)),
        checkout: list.findIndex((s) => stayCheckoutIdx(s) === idx),
    };
}

function stayNavQuery(s) {
    return (s.address || s.name || '').trim();
}

function renderDayStay(idx) {
    const el = document.getElementById('day-stay');
    if (!el) return;
    const editing = isEdit && !travelMode;
    const { tonight, checkout } = staysForDay(idx);
    const list = tripStays();
    const lines = [];
    if (checkout >= 0 && checkout !== tonight) {
        const s = list[checkout];
        lines.push(`<button type="button" class="stay-line stay-line-out" onclick="openStaySheet(${checkout})">
            <span aria-hidden="true">🧳</span><span class="stay-line-text">今日退房：${escapeHtml(s.name || '住宿')}</span></button>`);
    }
    if (tonight >= 0) {
        const s = list[tonight];
        const nav = stayNavQuery(s);
        lines.push(`<div class="stay-line">
            <button type="button" class="stay-line-main" onclick="openStaySheet(${tonight})">
                <span aria-hidden="true">🏨</span>
                <span class="stay-line-text">今晚住：<strong>${escapeHtml(s.name || '住宿')}</strong></span>
            </button>
            ${s.bookingRef ? `<button type="button" class="chip-copy" data-ref="${escapeAttr(s.bookingRef)}" onclick="copyBookingRef(this.dataset.ref)">${escapeHtml(s.bookingRef)}</button>` : ''}
            ${nav ? `<button type="button" class="stay-nav-btn" data-q="${escapeAttr(nav)}" onclick="openMapDirections(this.dataset.q)" aria-label="導航去住宿"><i class="fas fa-location-arrow" aria-hidden="true"></i></button>` : ''}
        </div>`);
    }
    document.getElementById('day-stay-add')?.classList.toggle('hidden', !(editing && tonight < 0));
    el.innerHTML = lines.join('');
    el.classList.toggle('hidden', !lines.length);
}

function renderStaysList() {
    const el = document.getElementById('stays-list');
    if (!el) return;
    const list = tripStays();
    document.getElementById('tools-stays-card')?.classList.toggle('is-empty', !list.length);
    if (!list.length) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = list
        .map((s, i) => ({ s, i }))
        .sort((a, b) => a.s.startIdx - b.s.startIdx)
        .map(
            ({ s, i }) => `<button type="button" class="stay-card" onclick="openStaySheet(${i})">
                <span class="stay-card-name">🏨 ${escapeHtml(s.name || '住宿')}</span>
                <span class="stay-card-dates">${escapeHtml(stayDayLabel(s.startIdx))} → ${escapeHtml(stayDayLabel(stayCheckoutIdx(s)))} · ${s.nights} 晚</span>
                ${s.address ? `<span class="stay-card-addr">${escapeHtml(s.address)}</span>` : ''}
            </button>`,
        )
        .join('');
}

// 刪咗某一日：之後嘅住宿向前移，包住嗰日嘅住宿少一晚
function shiftStaysForDeletedDay(i) {
    trip.stays = tripStays().filter((s) => {
        if (i < s.startIdx) {
            s.startIdx -= 1;
            return true;
        }
        if (i < stayCheckoutIdx(s)) {
            s.nights -= 1;
            return s.nights > 0;
        }
        return true;
    });
}

function openStaySheet(stayIdx = null, startIdx = curDayIdx) {
    const s = stayIdx != null ? tripStays()[stayIdx] : null;
    _stayEditIdx = s ? stayIdx : null;
    const start = s ? s.startIdx : startIdx;
    document.getElementById('stay-sheet-title').textContent = s ? '住宿' : '加住宿';
    document.getElementById('stay-name').value = s ? s.name : '';
    document.getElementById('stay-address').value = s ? s.address : '';
    document.getElementById('stay-nights').value = String(s ? s.nights : 1);
    document.getElementById('stay-ref').value = s ? s.bookingRef : '';
    document.getElementById('stay-cost').value = s && s.cost !== '' ? String(s.cost) : '';
    document.getElementById('stay-cost-currency').textContent = tripLocalCurrency();
    document.getElementById('stay-start').innerHTML = trip.itinerary
        .map((d, i) => `<option value="${i}"${i === start ? ' selected' : ''}>${escapeHtml(weatherDaySelectLabel(i))}</option>`)
        .join('');
    document.getElementById('stay-delete-btn').classList.toggle('hidden', !s);
    updateStayCheckout();
    document.getElementById('stay-sheet').classList.remove('hidden');
}

const STAY_MAX_NIGHTS = 60;

function stepStayNights(delta) {
    const input = document.getElementById('stay-nights');
    const n = Math.min(STAY_MAX_NIGHTS, Math.max(1, (parseInt(input.value, 10) || 1) + delta));
    input.value = String(n);
    updateStayCheckout();
}

// 「→ 3/9 週二 退房」
function updateStayCheckout() {
    const start = parseInt(document.getElementById('stay-start').value, 10) || 0;
    const n = parseInt(document.getElementById('stay-nights').value, 10) || 1;
    document.getElementById('stay-nights-text').textContent = `${n} 晚`;
    document.getElementById('stay-checkout').textContent = `→ ${stayDayLabel(start + n)} 退房`;
}

function closeStaySheet() {
    document.getElementById('stay-sheet')?.classList.add('hidden');
}

function refreshStayViews() {
    renderDayStay(curDayIdx);
    if (isToolsTabActive()) renderStaysList();
}

async function saveStayFromSheet() {
    const name = document.getElementById('stay-name').value.trim();
    if (!name) {
        await modalAlert('未填名稱', '請輸入酒店／住宿名稱');
        return;
    }
    const stay = migrateStay({
        name,
        address: document.getElementById('stay-address').value.trim(),
        startIdx: document.getElementById('stay-start').value,
        nights: document.getElementById('stay-nights').value,
        bookingRef: document.getElementById('stay-ref').value.trim(),
        cost: document.getElementById('stay-cost').value,
    });
    if (_stayEditIdx != null) tripStays()[_stayEditIdx] = stay;
    else tripStays().push(stay);
    save();
    closeStaySheet();
    refreshStayViews();
    showToast('已儲存住宿');
}

async function deleteStayFromSheet() {
    if (_stayEditIdx == null) return;
    if (!(await modalConfirm('刪除住宿', '確定刪除呢個住宿？', { danger: true, confirmText: '刪除' }))) return;
    tripStays().splice(_stayEditIdx, 1);
    save();
    closeStaySheet();
    refreshStayViews();
}
