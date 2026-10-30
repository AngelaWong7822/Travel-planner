/* UI/UX 增強 — 版面、設定、景點狀態、手勢、Modal focus */

// 設定入面嘅開關同 header 嘅「出門中」標籤
function syncTravelModeControls() {
    const toggle = document.getElementById('travel-mode-toggle');
    if (toggle) toggle.checked = travelMode;
    document.getElementById('travel-mode-chip')?.classList.toggle('hidden', !travelMode);
}

function syncTravelLayout() {
    document.body.classList.toggle('travel-mode-on', travelMode);
    document.body.classList.toggle('edit-mode-on', isEdit && !travelMode);

    syncTravelModeControls();
    syncToolsLayout();
}

function syncToolsLayout() {
    const groupTravel = document.getElementById('tools-group-travel');
    if (groupTravel) groupTravel.textContent = '✈️ 出門必備';
}

function toggleToolsAdvancedMenu() {
    const menu = document.getElementById('tools-advanced-menu');
    const btn = document.getElementById('tools-advanced-btn');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

function closeToolsAdvancedMenu() {
    document.getElementById('tools-advanced-menu')?.classList.add('hidden');
    document.getElementById('tools-advanced-btn')?.setAttribute('aria-expanded', 'false');
}

// 新加／剛剔嘅項目彈一下（減少動態效果時唔做）
function cutePop(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('cute-pop');
    void el.offsetWidth;
    el.classList.add('cute-pop');
}

function openSettingsSheet() {
    closeHeaderMenu();
    if (typeof renderBackupInfo === 'function') renderBackupInfo();
    document.getElementById('settings-sheet')?.classList.remove('hidden');
    document.getElementById('header-settings-btn')?.setAttribute('aria-expanded', 'true');
}

function closeSettingsSheet() {
    document.getElementById('settings-sheet')?.classList.add('hidden');
    document.getElementById('header-settings-btn')?.setAttribute('aria-expanded', 'false');
}

function eventStatusMeta(status) {
    const s = typeof normalizeEventStatus === 'function' ? normalizeEventStatus(status) : status;
    const map = {
        pending: { label: '待辦', cls: 'status-pending', icon: 'far fa-circle' },
        booked: { label: '已訂', cls: 'status-booked', icon: 'fas fa-check' },
        done: { label: '已完成', cls: 'status-done', icon: 'fas fa-flag-checkered' },
    };
    return map[s] || map.pending;
}

function renderStatusBadgeHtml(status, { interactive = false, dayIdx, eventIdx } = {}) {
    const meta = eventStatusMeta(status);
    const content = `<i class="${meta.icon} mr-1" aria-hidden="true"></i>${escapeHtml(meta.label)}`;
    if (!interactive) {
        return `<span class="status-badge ${meta.cls}">${content}</span>`;
    }
    return `<button type="button" onclick='event.stopPropagation();openEventStatusPicker(${dayIdx}, ${eventIdx})' class="status-badge ${meta.cls} status-tap" aria-label="更改狀態">${content}</button>`;
}

function openEventStatusPicker(dayIdx, eventIdx) {
    const ev = trip.itinerary[dayIdx]?.events[eventIdx];
    if (!ev) return;
    window._statusPick = { dayIdx, eventIdx };
    const locEl = document.getElementById('event-status-picker-loc');
    const optsEl = document.getElementById('event-status-picker-options');
    if (locEl) locEl.textContent = ev.loc || '景點';
    if (optsEl) {
        const cur = normalizeEventStatus(ev.status);
        const statuses = window.EVENT_STATUS_VALUES || ['pending', 'booked', 'done'];
        optsEl.innerHTML = statuses.map((s) => {
            const meta = eventStatusMeta(s);
            const active = s === cur ? ' status-picker-opt-active' : '';
            return `<button type="button" class="status-picker-opt ${meta.cls}${active}" onclick='setEventStatus(${dayIdx}, ${eventIdx}, ${JSON.stringify(s)})'><i class="${meta.icon} mr-2" aria-hidden="true"></i>${escapeHtml(meta.label)}</button>`;
        }).join('');
    }
    document.getElementById('event-status-picker')?.classList.remove('hidden');
}

function closeEventStatusPicker() {
    document.getElementById('event-status-picker')?.classList.add('hidden');
    window._statusPick = null;
}

// 旅程圓形頭像：粉彩底 + 深色字，跟名計顏色，同一個旅程永遠同色
const TRIP_AVATAR_TINTS = [
    ['#ffe0e9', '#e0567a'],
    ['#dff5ec', '#2f8f6b'],
    ['#ece6ff', '#7a5bc7'],
    ['#fff3cf', '#b7791f'],
    ['#e3f0ff', '#3b7fc0'],
    ['#ffe8dc', '#d0693a'],
];

function tripAvatarTint(name, idx) {
    let h = 0;
    const s = name || '';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TRIP_AVATAR_TINTS[Math.abs(h + idx) % TRIP_AVATAR_TINTS.length];
}

// 「5 天 · 10/21–10/25 · 東京」
function tripSummaryLine(t) {
    const days = t.itinerary?.length || 0;
    const bits = [`${days} 天`];
    if (t.startDate) {
        const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        const start = addDaysFromIso(t.startDate, 0);
        const end = addDaysFromIso(t.startDate, Math.max(0, days - 1));
        bits.push(days > 1 ? `${md(start)}–${md(end)}` : md(start));
    }
    return bits.join(' · ');
}

function renderTripPicker() {
    const list = document.getElementById('trip-picker');
    if (!list) return;
    const canManage = !travelMode;
    list.innerHTML = data.trips
        .map((t, i) => {
            const active = i === data.activeIdx;
            const name = (t.name || '旅程').trim() || '旅程';
            const [bg, ink] = tripAvatarTint(name, i);
            const flag = weatherLocationFlagUrl(t.city);
            const avatar = flag ? `<img src="${flag}" alt="">` : escapeHtml([...name][0]);
            const actions =
                active && canManage
                    ? `<button type="button" class="trip-row-icon" onclick="closeHeaderMenu(); openTripSettings();" aria-label="「${escapeAttr(name)}」設定"><i class="fas fa-ellipsis-h" aria-hidden="true"></i></button>`
                    : '';
            return `<div class="trip-row${active ? ' active' : ''}">
                <button type="button" role="option" aria-selected="${active}" class="trip-row-main" onclick="${active ? 'closeHeaderMenu();' : `switchTrip(${i}); closeHeaderMenu();`}">
                    <span class="trip-avatar" style="background:${bg};color:${ink}" aria-hidden="true">${avatar}</span>
                    <span class="trip-picker-meta">
                        <span class="trip-picker-name">${escapeHtml(name)}</span>
                        <span class="trip-picker-days">${escapeHtml(tripSummaryLine(t))}</span>
                    </span>
                    ${active ? '<i class="fas fa-check trip-picker-check" aria-hidden="true"></i>' : ''}
                </button>
                ${actions}
            </div>`;
        })
        .join('');
}

// ⋯ 旅程設定：改名、目的地、刪除；＋ 新旅程都用同一個視窗
let tripSettingsIsNew = false;

function openTripSettings(isNew = false) {
    if (travelMode) return;
    tripSettingsIsNew = isNew;
    const nameEl = document.getElementById('trip-settings-name');
    nameEl.value = isNew ? '新旅程' : trip.name || '';
    const sel = document.getElementById('weather-location-select');
    sel.innerHTML = weatherLocationOptionsHtml(trip.city || 'Tokyo');
    sel.value = getWeatherLocation(trip.city || 'Tokyo').id;
    document.getElementById('trip-settings-title').textContent = isNew ? '新增旅程' : '旅程設定';
    document.getElementById('trip-settings-save').textContent = isNew ? '建立' : '儲存';
    document.getElementById('trip-settings-delete').classList.toggle('hidden', isNew || data.trips.length <= 1);
    document.getElementById('trip-settings-sheet').classList.remove('hidden');
    if (isNew) {
        nameEl.focus();
        nameEl.select();
    }
}

function closeTripSettings() {
    document.getElementById('trip-settings-sheet')?.classList.add('hidden');
}

function saveTripSettings() {
    const name = document.getElementById('trip-settings-name').value.trim();
    const city = document.getElementById('weather-location-select').value;
    closeTripSettings();
    if (tripSettingsIsNew) {
        const t = defaultTrip(name || '新旅程', city || 'Tokyo');
        t.localCurrency = weatherLocationCurrency(t.city) || t.localCurrency;
        data.trips.push(t);
        switchTrip(data.trips.length - 1);
        return;
    }
    if (name) trip.name = name;
    if (city && city !== trip.city) onWeatherLocationSelect(city);
    else save();
    const cur = weatherLocationCurrency(trip.city);
    if (cur && cur !== tripLocalCurrency()) setTripLocalCurrency(cur);
    renderTripHeader();
}

function renderTripHeader() {
    const title = document.getElementById('trip-title');
    if (title) title.textContent = trip.name || '我的旅行';
    renderTripPicker();
}

const HEADER_MENU_TRIGGERS = ['header-title-btn'];

function toggleHeaderMenu() {
    const menu = document.getElementById('header-menu');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) {
        renderTripPicker();
        document.getElementById('trip-add-btn')?.classList.toggle('hidden', travelMode);
    }
    menu.classList.toggle('hidden', !willOpen);
    HEADER_MENU_TRIGGERS.forEach((id) =>
        document.getElementById(id)?.setAttribute('aria-expanded', willOpen ? 'true' : 'false'),
    );
}

function closeHeaderMenu() {
    document.getElementById('header-menu')?.classList.add('hidden');
    HEADER_MENU_TRIGGERS.forEach((id) => document.getElementById(id)?.setAttribute('aria-expanded', 'false'));
}

function dismissSwipeHint() {
    localStorage.setItem(SWIPE_HINT_KEY, '1');
    document.getElementById('swipe-hint')?.classList.add('hidden');
}

function maybeShowSwipeHint() {}

function expandEventEdit(dayIdx, i) {
    openEventEditSheet(dayIdx, i);
}

// 常用欄位擺出嚟，其他收入「更多」；摘要會講返入面已經填咗啲咩
function renderEventEditSheetFields(dayIdx, i, ev) {
    const statusUI = renderStatusBadgeHtml(ev.status, { interactive: true, dayIdx, eventIdx: i });
    const status = normalizeEventStatus(ev.status);
    const filled = [
        status !== 'pending' ? eventStatusMeta(status).label : '',
        ev.bookingRef ? `訂位 ${ev.bookingRef}` : '',
        ev.tag || '',
        ev.cost !== '' && ev.cost != null ? formatAmount(ev.cost) : '',
        ev.link ? '連結' : '',
        ev.img ? '圖片' : '',
    ].filter(Boolean);
    const path = `trip.itinerary[${dayIdx}].events[${i}]`;
    return `
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">景點名稱</span>
            <input oninput="${path}.loc=this.value;debouncedSave();document.getElementById('event-edit-picker-loc').textContent=this.value||'景點'" value="${escapeAttr(ev.loc)}" placeholder="景點名稱" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">時間</span>
            <input type="time" oninput="${path}.time=this.value;debouncedSave();debouncedRenderDay()" value="${escapeAttr(ev.time)}" class="field-input w-full mt-1">
        </label>
        <label class="event-edit-sheet-field">
            <span class="type-micro text-muted">備註</span>
            <textarea oninput="${path}.remark=this.value;debouncedSave()" placeholder="備註" class="field-input field-textarea w-full mt-1">${escapeHtml(ev.remark || '')}</textarea>
        </label>
        <details class="event-edit-more">
            <summary>更多${filled.length ? `<span class="event-edit-more-hint">· ${escapeHtml(filled.join(' · '))}</span>` : ''}</summary>
            <div class="event-edit-sheet-field">
                <span class="type-micro text-muted">狀態</span>
                <div class="mt-1">${statusUI}</div>
            </div>
            <label class="event-edit-sheet-field">
                <span class="type-micro text-muted">訂位／票號</span>
                <input oninput="${path}.bookingRef=this.value;debouncedSave()" value="${escapeAttr(ev.bookingRef)}" placeholder="訂位編號" class="field-input w-full mt-1">
            </label>
            <label class="event-edit-sheet-field">
                <span class="type-micro text-muted">標籤</span>
                <input oninput="${path}.tag=this.value;debouncedSave()" value="${escapeAttr(ev.tag)}" placeholder="例：美食" class="field-input w-full mt-1">
            </label>
            <label class="event-edit-sheet-field">
                <span class="type-micro text-muted">預估花費（${escapeAttr(tripLocalCurrency())}）</span>
                <input type="number" oninput="${path}.cost=this.value;debouncedSave();renderDaySelector();syncTripScheduleChrome()" value="${escapeAttr(ev.cost === '' || ev.cost == null ? '' : String(ev.cost))}" class="field-input w-full mt-1" inputmode="decimal">
            </label>
            <label class="event-edit-sheet-field">
                <span class="type-micro text-muted">地圖連結</span>
                <input oninput="${path}.link=this.value;debouncedSave()" value="${escapeAttr(ev.link)}" placeholder="https://…" class="field-input w-full mt-1">
            </label>
            <div class="event-edit-sheet-field">
                <span class="type-micro text-muted">圖片</span>
                <div id="event-edit-img-preview" class="event-edit-img-preview mt-1"></div>
                <button type="button" onclick="curEventIdx=${i};triggerFile('event-img-input')" class="btn-inline mt-2">上傳／更換</button>
            </div>
        </details>
        <div class="event-edit-actions mt-2">
            <button type="button" onclick="copyEvent(${dayIdx}, ${i})" class="btn-inline btn-inline-pink">複製</button>
            <button type="button" onclick="removeEvent(${dayIdx}, ${i})" class="btn-inline btn-inline-danger">刪除</button>
        </div>`;
}

async function updateEventEditSheetImagePreview(dayIdx, i) {
    const wrap = document.getElementById('event-edit-img-preview');
    if (!wrap) return;
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev?.img) {
        wrap.innerHTML = '<p class="type-micro text-muted">未上傳圖片</p>';
        return;
    }
    const url = await resolveImageUrl(ev.img);
    wrap.innerHTML = `<button type="button" class="event-edit-img-thumb-btn" onclick='showBig(${JSON.stringify(ev.img)})'><img src="${escapeAttr(url || ev.img)}" alt="景點圖片" class="event-edit-img-thumb"></button>`;
}

function refreshEventEditSheetIfOpen(dayIdx, i) {
    const picker = document.getElementById('event-edit-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    if (window._eventEditDayIdx !== dayIdx || window._eventEditIdx !== i) return;
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev) return;
    const body = document.getElementById('event-edit-picker-body');
    if (body) body.innerHTML = renderEventEditSheetFields(dayIdx, i, ev);
    updateEventEditSheetImagePreview(dayIdx, i);
}

function openEventEditSheet(dayIdx, i) {
    const ev = trip.itinerary[dayIdx]?.events[i];
    if (!ev) return;
    window._eventEditDayIdx = dayIdx;
    window._eventEditIdx = i;
    curEventIdx = i;
    const locEl = document.getElementById('event-edit-picker-loc');
    const body = document.getElementById('event-edit-picker-body');
    if (locEl) locEl.textContent = ev.loc || '景點';
    if (body) body.innerHTML = renderEventEditSheetFields(dayIdx, i, ev);
    updateEventEditSheetImagePreview(dayIdx, i);
    document.getElementById('event-edit-picker')?.classList.remove('hidden');
}

function closeEventEditSheet(opts) {
    const silent = opts === true || opts?.silent;
    const picker = document.getElementById('event-edit-picker');
    if (!picker || picker.classList.contains('hidden')) return;
    picker.classList.add('hidden');
    const dayIdx = window._eventEditDayIdx;
    window._eventEditDayIdx = null;
    window._eventEditIdx = null;
    if (!silent && dayIdx != null) {
        renderDay(dayIdx);
        renderDaySelector();
        syncTripScheduleChrome();
    }
}

function openMapPrimary(loc, link) {
    const href = safeExternalUrl(link);
    if (href) {
        openExternalUrl(href);
        return;
    }
    const q = (loc || '').trim();
    if (q) openMapDirections(q);
}

function renderEventStatusUI(dayIdx, eventIdx, ev) {
    if (isEdit && !travelMode) return '';
    // 「待辦」係預設，唔使掛喺每個景點；出門模式要撳嚟剔完成，先照顯示
    if (!travelMode && normalizeEventStatus(ev.status) === 'pending') return '';
    return renderStatusBadgeHtml(ev.status, {
        interactive: travelMode,
        dayIdx,
        eventIdx,
    });
}

// 景點名旁邊嘅細導航掣（冇地點但有連結就開連結）
// 未填地點（空白或者預設名）就唔出地圖掣
const PLACEHOLDER_LOCS = ['景點', '新景點／地點'];

function renderMapActionsUI(loc, link) {
    const href = safeExternalUrl(link);
    const raw = (loc || '').trim();
    const locStr = PLACEHOLDER_LOCS.includes(raw) ? '' : raw;
    if (locStr) {
        return `<button type="button" class="event-nav-btn" data-loc="${escapeAttr(locStr)}" data-link="${escapeAttr(link || '')}" onclick="event.stopPropagation();openMapPrimary(this.dataset.loc, this.dataset.link)" aria-label="Google Maps：${escapeAttr(locStr)}"><i class="fas fa-location-arrow" aria-hidden="true"></i></button>`;
    }
    if (href) {
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" class="event-nav-btn" aria-label="開啟連結"><i class="fas fa-link" aria-hidden="true"></i></a>`;
    }
    return '';
}

function setupDaySwipe() {
    const card = document.getElementById('main-day-card');
    if (!card || card._swipeBound) return;
    card._swipeBound = true;
    let startX = 0;
    let startY = 0;
    card.addEventListener(
        'touchstart',
        (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        },
        { passive: true },
    );
    card.addEventListener(
        'touchend',
        (e) => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
            if (dx < 0 && curDayIdx < trip.itinerary.length - 1) {
                dismissSwipeHint();
                renderDay(curDayIdx + 1);
            } else if (dx > 0 && curDayIdx > 0) {
                dismissSwipeHint();
                renderDay(curDayIdx - 1);
            }
        },
        { passive: true },
    );
}

function setupModalFocusTrap() {
    const modal = document.getElementById('app-modal');
    if (!modal || modal._trapBound) return;
    modal._trapBound = true;
    modal.addEventListener('keydown', (e) => {
        if (modal.classList.contains('hidden') || e.key !== 'Tab') return;
        const focusable = modal.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])');
        const list = Array.from(focusable).filter((el) => !el.classList.contains('hidden') && !el.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}

function setupUiUx() {
    setupDaySwipe();
    setupModalFocusTrap();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeHeaderMenu();
    });
    maybeShowSwipeHint();
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('header-menu');
        const onTrigger = HEADER_MENU_TRIGGERS.some((id) => document.getElementById(id)?.contains(e.target));
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !onTrigger) {
            closeHeaderMenu();
        }
        const advBtn = document.getElementById('tools-advanced-btn');
        const advMenu = document.getElementById('tools-advanced-menu');
        if (
            advMenu &&
            !advMenu.classList.contains('hidden') &&
            !advMenu.contains(e.target) &&
            !advBtn?.contains(e.target)
        ) {
            closeToolsAdvancedMenu();
        }
    });
}

window.openEventStatusPicker = openEventStatusPicker;
window.closeEventStatusPicker = closeEventStatusPicker;
window.openMapPrimary = openMapPrimary;
window.toggleToolsAdvancedMenu = toggleToolsAdvancedMenu;
window.closeToolsAdvancedMenu = closeToolsAdvancedMenu;
window.openEventEditSheet = openEventEditSheet;
window.closeEventEditSheet = closeEventEditSheet;
window.refreshEventEditSheetIfOpen = refreshEventEditSheetIfOpen;
window.syncTravelModeControls = syncTravelModeControls;
