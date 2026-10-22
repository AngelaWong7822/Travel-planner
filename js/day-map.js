/* 景點地圖 — Leaflet + OpenStreetMap；依賴 app.js 全域狀態與工具函式 */

const DAY_VIEW_KEY = 'TRAVEL_APP_DAY_VIEW';
const GEOCODE_GAP_MS = 1100; // Nominatim 規定每秒最多 1 次
const ROUTE_MAX_POINTS = 10;

let dayMap = null;
let dayMapLayer = null;
let dayMapFitKey = '';
let dayMapPick = null; // { ev, dayIdx } — 等用家撳地圖設定位置
let geocodeQueue = [];
let geocodeRunning = false;
const geocodeMisses = new Set(); // 今次查唔到嘅景點名，唔再重複查

function getDayView() {
    try {
        return localStorage.getItem(DAY_VIEW_KEY) === 'map' ? 'map' : 'list';
    } catch (_) {
        return 'list';
    }
}

function setDayView(view) {
    try {
        localStorage.setItem(DAY_VIEW_KEY, view);
    } catch (_) {}
    if (view !== 'map') setDayMapPick(null);
    syncDayMap(curDayIdx);
}

function isWideDayLayout() {
    return window.matchMedia('(min-width: 1024px)').matches;
}

function geoKey(ev) {
    return (ev?.loc || '').trim();
}

function eventHasCoords(ev) {
    return ev.lat != null && ev.lon != null;
}

function eventCoordsFresh(ev) {
    return eventHasCoords(ev) && ev.geoQ === geoKey(ev);
}

function dayMapEntries(dayIdx) {
    const day = trip.itinerary[dayIdx];
    if (!day) return [];
    return sortEventEntries(day.events.map((ev, i) => ({ ev, i })));
}

function isDayMapVisible() {
    const wrap = document.getElementById('day-map-wrap');
    return !!wrap && !wrap.classList.contains('hidden');
}

function syncDayMap(dayIdx) {
    const wrap = document.getElementById('day-map-wrap');
    const bar = document.getElementById('day-view-bar');
    if (!wrap || !bar) return;
    const editing = isEdit && !travelMode;
    const entries = dayMapEntries(dayIdx);
    const wide = isWideDayLayout();
    const showMap = !editing && entries.length > 0 && (wide || getDayView() === 'map');

    bar.classList.toggle('hidden', editing || entries.length === 0);
    bar.querySelectorAll('[data-view]').forEach((btn) => {
        const on = btn.dataset.view === (showMap ? 'map' : 'list');
        btn.classList.toggle('day-view-btn-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('day-route-btn')?.classList.toggle('hidden', entries.length < 2);
    document.getElementById('main-day-card')?.classList.toggle('day-map-on', showMap);
    document.getElementById('timeline')?.classList.toggle('hidden', showMap && !wide);
    wrap.classList.toggle('hidden', !showMap);

    if (!showMap) return;
    if (typeof L === 'undefined') {
        setDayMapStatusHtml('<p>地圖載入唔到，請連線後再試</p>');
        return;
    }
    ensureDayMap();
    drawDayMap(dayIdx);
    queueGeocode(dayIdx);
}

function ensureDayMap() {
    if (dayMap) {
        setTimeout(() => dayMap.invalidateSize(), 0);
        return;
    }
    dayMap = L.map('day-map', { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(dayMap);
    dayMapLayer = L.layerGroup().addTo(dayMap);
    dayMap.on('click', onDayMapClick);
}

function dayMapPopupHtml(dayIdx, i, ev) {
    const loc = ev.loc || '景點';
    return `<div class="day-map-popup">
        <p class="day-map-popup-time">${escapeHtml(ev.time || '--:--')}</p>
        <p class="day-map-popup-loc">${escapeHtml(loc)}</p>
        <div class="day-map-popup-actions">
            <button type="button" data-loc="${escapeAttr(loc)}" onclick="openMapDirections(this.dataset.loc)"><i class="fas fa-location-arrow" aria-hidden="true"></i>去呢度</button>
            <button type="button" onclick="startDayMapPick(${dayIdx}, ${i})"><i class="fas fa-map-pin" aria-hidden="true"></i>改位置</button>
        </div>
    </div>`;
}

function drawDayMap(dayIdx) {
    if (!dayMap || !dayMapLayer) return;
    dayMapLayer.clearLayers();
    const pts = [];
    dayMapEntries(dayIdx).forEach(({ ev, i }, order) => {
        if (!eventHasCoords(ev)) return;
        const ll = [ev.lat, ev.lon];
        pts.push(ll);
        const icon = L.divIcon({
            className: `day-map-pin${ev.status === 'done' ? ' day-map-pin-done' : ''}`,
            html: `<span>${order + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14],
        });
        L.marker(ll, { icon, title: ev.loc || '' })
            .bindPopup(dayMapPopupHtml(dayIdx, i, ev))
            .addTo(dayMapLayer);
    });
    if (pts.length > 1) {
        L.polyline(pts, { color: '#FF85A1', weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(dayMapLayer);
    }
    // 只喺日子或者點有變時先重新對焦，唔好搶走用家自己拖過嘅位置
    const fitKey = `${dayIdx}|${JSON.stringify(pts)}`;
    if (fitKey !== dayMapFitKey) {
        dayMapFitKey = fitKey;
        if (pts.length) {
            dayMap.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 16 });
        } else {
            const loc = getWeatherLocation(trip.city);
            if (loc.lat != null) dayMap.setView([loc.lat, loc.lon], 11);
        }
    }
    renderDayMapStatus(dayIdx);
}

function setDayMapStatusHtml(html) {
    const el = document.getElementById('day-map-status');
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('hidden', !html);
}

function renderDayMapStatus(dayIdx) {
    if (dayMapPick) {
        setDayMapStatusHtml(
            `<p class="day-map-status-pick"><i class="fas fa-hand-pointer" aria-hidden="true"></i>撳地圖揀「${escapeHtml(geoKey(dayMapPick.ev) || '景點')}」嘅位置</p>
            <button type="button" class="chip-copy" onclick="setDayMapPick(null)">取消</button>`,
        );
        return;
    }
    const missing = dayMapEntries(dayIdx).filter(({ ev }) => !eventHasCoords(ev) && geoKey(ev));
    const searching = missing.filter(({ ev }) => !geocodeMisses.has(geoKey(ev)));
    if (searching.length && navigator.onLine) {
        setDayMapStatusHtml(`<p>搵緊位置…（剩 ${searching.length} 個）</p>`);
        return;
    }
    if (missing.length) {
        const chips = missing
            .map(({ ev, i }) => `<button type="button" class="chip-copy" onclick="startDayMapPick(${dayIdx}, ${i})">${escapeHtml(geoKey(ev))}</button>`)
            .join('');
        setDayMapStatusHtml(`<p>搵唔到位置，撳一下再喺地圖揀：</p><div class="day-map-status-chips">${chips}</div>`);
        return;
    }
    setDayMapStatusHtml('');
}

function queueGeocode(dayIdx) {
    dayMapEntries(dayIdx).forEach(({ ev }) => {
        const q = geoKey(ev);
        if (!q || eventCoordsFresh(ev) || geocodeMisses.has(q)) return;
        if (!geocodeQueue.some((job) => job.ev === ev)) geocodeQueue.push({ ev, dayIdx });
    });
    runGeocodeQueue();
}

// Nominatim 對中文名會模糊配對（例：「晴空塔」→「青空広場」），
// 所以要結果名稱有至少一半字同景點名一樣先接受；寧願搵唔到俾用家自己揀，都唔好釘錯
function geoNameMatches(q, hit) {
    const chars = [...q.replace(/[\s\p{P}]/gu, '').toLowerCase()];
    if (!chars.length) return false;
    const name = String(hit.name || '').toLowerCase();
    return chars.filter((c) => name.includes(c)).length / chars.length >= 0.6;
}

function geoDist2(a, b) {
    return (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2;
}

async function searchNominatim(q, bounded) {
    const loc = getWeatherLocation(trip.city);
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: '5', 'accept-language': 'zh-TW,ja,en' });
    if (loc.lat != null) {
        const d = bounded ? 0.75 : 1.5; // 0.75° 大約 80km
        params.set('viewbox', `${loc.lon - d},${loc.lat + d},${loc.lon + d},${loc.lat - d}`);
        if (bounded) params.set('bounded', '1');
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    return (await res.json())
        .filter((h) => geoNameMatches(q, h))
        .map((h) => ({ lat: Number(h.lat), lon: Number(h.lon) }));
}

// 同一日已定位景點嘅中心；冇就用目的地
function geoAnchor(dayIdx, exceptEv) {
    const pts = dayMapEntries(dayIdx)
        .map(({ ev }) => ev)
        .filter((ev) => ev !== exceptEv && eventCoordsFresh(ev));
    if (pts.length) {
        return {
            lat: pts.reduce((s, ev) => s + ev.lat, 0) / pts.length,
            lon: pts.reduce((s, ev) => s + ev.lon, 0) / pts.length,
        };
    }
    const loc = getWeatherLocation(trip.city);
    return loc.lat != null ? { lat: loc.lat, lon: loc.lon } : null;
}

async function geocodePlace(q, anchor) {
    const city = getWeatherLocation(trip.city).label || '';
    // 「成田機場 NRT」呢類：拎走尾段英文代號都試埋；中文名加城市名通常準啲（例：東京晴空塔）
    const stripped = q.replace(/(\s+[A-Za-z0-9-]+)+$/, '').trim() || q;
    const variants = [q, stripped];
    if (city && !stripped.includes(city)) variants.push(city + stripped);
    const attempts = [...new Set(variants)].map((query) => [query, true]).concat([[q, false]]);
    for (let n = 0; n < attempts.length; n++) {
        if (n) await new Promise((r) => setTimeout(r, GEOCODE_GAP_MS));
        const hits = await searchNominatim(...attempts[n]);
        // 同名地方（例：沼津都有「仲見世」）揀最近嗰個
        if (anchor) hits.sort((a, b) => geoDist2(a, anchor) - geoDist2(b, anchor));
        if (hits.length) return hits[0];
    }
    return null;
}

async function runGeocodeQueue() {
    if (geocodeRunning) return;
    geocodeRunning = true;
    try {
        while (geocodeQueue.length && navigator.onLine) {
            const { ev, dayIdx } = geocodeQueue.shift();
            const q = geoKey(ev);
            if (!q || eventCoordsFresh(ev)) continue;
            let hit;
            try {
                hit = await geocodePlace(q, geoAnchor(dayIdx, ev));
            } catch (_) {
                // 網絡問題：留返下次再試，唔當係搵唔到
                geocodeQueue = [];
                break;
            }
            if (hit) {
                ev.lat = hit.lat;
                ev.lon = hit.lon;
                ev.geoQ = q;
                debouncedSave();
            } else {
                geocodeMisses.add(q);
            }
            if (dayIdx === curDayIdx && isDayMapVisible()) drawDayMap(dayIdx);
            await new Promise((r) => setTimeout(r, GEOCODE_GAP_MS));
        }
    } finally {
        geocodeRunning = false;
        if (isDayMapVisible()) renderDayMapStatus(curDayIdx);
    }
}

function setDayMapPick(pick) {
    dayMapPick = pick;
    document.getElementById('day-map')?.classList.toggle('day-map-picking', !!pick);
    if (isDayMapVisible()) renderDayMapStatus(curDayIdx);
}

async function startDayMapPick(dayIdx, eventIdx) {
    const ev = trip.itinerary[dayIdx]?.events[eventIdx];
    if (!ev) return;
    dayMap?.closePopup();
    if (typeof closeEventEditSheet === 'function') closeEventEditSheet({ silent: true });
    // 編輯模式冇地圖；離開時會重新排序，所以記住景點本身而唔係 index
    if (isEdit && !travelMode) await toggleEdit();
    if (curDayIdx !== dayIdx) await renderDay(dayIdx);
    try {
        localStorage.setItem(DAY_VIEW_KEY, 'map');
    } catch (_) {}
    dayMapPick = { ev, dayIdx };
    syncDayMap(dayIdx);
    setDayMapPick(dayMapPick);
    document.getElementById('day-map-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function onDayMapClick(e) {
    if (!dayMapPick) return;
    const { ev, dayIdx } = dayMapPick;
    ev.lat = Math.round(e.latlng.lat * 1e6) / 1e6;
    ev.lon = Math.round(e.latlng.lng * 1e6) / 1e6;
    ev.geoQ = geoKey(ev);
    geocodeMisses.delete(geoKey(ev));
    save();
    setDayMapPick(null);
    if (dayIdx === curDayIdx) drawDayMap(dayIdx);
    showToast('已設定位置');
}

function openDayRoute(dayIdx = curDayIdx) {
    const stops = dayMapEntries(dayIdx).map(({ ev }) => geoKey(ev)).filter(Boolean);
    if (stops.length < 2) return;
    const used = stops.slice(0, ROUTE_MAX_POINTS);
    const params = new URLSearchParams({ api: '1', origin: used[0], destination: used[used.length - 1] });
    if (used.length > 2) params.set('waypoints', used.slice(1, -1).join('|'));
    if (stops.length > used.length) {
        showToast(`路線最多 ${ROUTE_MAX_POINTS} 個點，已略過最後 ${stops.length - used.length} 個`);
    }
    openExternalUrl(`https://www.google.com/maps/dir/?${params}`);
}

function setupDayMap() {
    window.matchMedia('(min-width: 1024px)').addEventListener('change', () => syncDayMap(curDayIdx));
}
