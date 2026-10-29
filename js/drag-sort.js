/* 拖放排序 — SortableJS：同一日嘅景點、日子、行李清單；只喺可以編輯時拖得
 * 手機要長按少少先開始拖，咁捲動同撳掣唔會誤觸。依賴 app.js 全域狀態與工具函式 */

const SORT_BASE = {
    animation: 180,
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
};

let eventSortable = null;
let daySortable = null;
let checkSortable = null;

function minsToTime(m) {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 行程按時間排：拖完如果時間同新位置對唔上，就改成前後兩個景點中間（對得上就唔郁）
function fitEventTime(events, k) {
    const ev = events[k];
    const prev = k > 0 ? parseEventTime(events[k - 1].time) : null;
    const next = k < events.length - 1 ? parseEventTime(events[k + 1].time) : null;
    const cur = parseEventTime(ev.time);
    if (cur != null && (prev == null || cur >= prev) && (next == null || cur <= next)) return null;
    let t;
    if (prev != null && next != null) t = Math.min(next, Math.max(prev, Math.round((prev + next) / 2 / 5) * 5));
    else if (prev != null) t = Math.min(prev + 60, 23 * 60 + 55);
    else if (next != null) t = Math.max(next - 60, 0);
    else return null;
    ev.time = minsToTime(t);
    return ev.time;
}

function moveItem(list, from, to) {
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    return item;
}

/* ── 同一日嘅景點 ── */

function syncEventSortable() {
    const el = document.getElementById('timeline');
    if (!el || !window.Sortable) return;
    if (!eventSortable) {
        eventSortable = Sortable.create(el, {
            ...SORT_BASE,
            draggable: '.timeline-event',
            handle: '.event-drag-handle',
            onEnd: onEventDragEnd,
        });
    }
    eventSortable.option('disabled', !(isEdit && !travelMode));
}

async function onEventDragEnd(e) {
    const from = e.oldDraggableIndex;
    const to = e.newDraggableIndex;
    if (from == null || to == null || from === to) return;
    const events = trip.itinerary[curDayIdx].events;
    const moved = moveItem(events, from, to);
    const newTime = fitEventTime(events, to);
    save();
    renderDaySelector();
    await renderDay(curDayIdx);
    showToast(newTime ? `「${moved.loc || '景點'}」時間改咗做 ${newTime}` : '已調位');
}

/* ── 日子 ── */

function syncDaySortable() {
    const el = document.getElementById('day-selector');
    if (!el || !window.Sortable) return;
    if (!daySortable) {
        daySortable = Sortable.create(el, {
            ...SORT_BASE,
            draggable: '.day-card-wrap',
            direction: 'horizontal',
            onEnd: onDayDragEnd,
        });
    }
    daySortable.option('disabled', !(isEdit && !travelMode));
}

async function onDayDragEnd(e) {
    const from = e.oldDraggableIndex;
    const to = e.newDraggableIndex;
    if (from == null || to == null || from === to) return;
    moveItem(trip.itinerary, from, to);
    // 冇出發日期時日子名係「Day 3」呢類，跟新位置重新編號
    if (!trip.startDate) {
        trip.itinerary.forEach((d, i) => {
            if (/^Day \d+$/.test(d.date || '')) d.date = `Day ${i + 1}`;
        });
    }
    // 依家睇緊嗰日跟住移
    if (curDayIdx === from) curDayIdx = to;
    else if (from < curDayIdx && to >= curDayIdx) curDayIdx -= 1;
    else if (from > curDayIdx && to <= curDayIdx) curDayIdx += 1;
    save();
    renderDaySelector();
    await renderDay(curDayIdx);
    showToast('已調位');
}

/* ── 行李清單 ── */

function syncCheckSortable() {
    const el = document.getElementById('check-list');
    if (!el || !window.Sortable) return;
    if (!checkSortable) {
        checkSortable = Sortable.create(el, {
            ...SORT_BASE,
            handle: '.check-drag-handle',
            onEnd: onCheckDragEnd,
        });
    }
    checkSortable.option('disabled', !canEditToolsContent());
}

function onCheckDragEnd(e) {
    const from = e.oldDraggableIndex;
    const to = e.newDraggableIndex;
    if (from == null || to == null || from === to) return;
    moveItem(trip.checklist, from, to);
    save();
    renderCheck();
}
