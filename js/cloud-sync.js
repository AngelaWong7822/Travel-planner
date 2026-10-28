/* 雲端同步 — Supabase：email 登入、旅程上傳／下載、相片；依賴 app.js 全域狀態與工具函式
 *
 * 本機（localStorage + IndexedDB）係主要工作副本，冇網絡照用；登入咗就喺背景同 Supabase 對數：
 * - 每個旅程一行（trips.data = 成個旅程 JSON），以「成個旅程」做單位，最後改嗰個贏
 * - 相片用返本機 idb id 做檔名，上傳去 trip-images/<user id>/<id>；另一部機要用時先下載
 */

const CLOUD_META_KEY = 'TRAVEL_CLOUD_META';
const CLOUD_BUCKET = 'trip-images';
const CLOUD_PUSH_DELAY_MS = 1200;
const CLOUD_POLL_MS = 5 * 60 * 1000;

let cloud = null;
let cloudUser = null;
let cloudState = 'off'; // off | signedout | idle | syncing | offline | error
let cloudError = '';
let cloudSyncing = false;
let cloudSyncAgain = false;
let cloudPushTimer = null;
let cloudApplying = false;
let cloudLoginEmail = '';
const cloudImageMisses = new Set();

/* ── meta：記住每個旅程上次同步嘅版本 ── */

function freshCloudMeta(userId = '') {
    // synced[id] = { at: 雲端 updated_at, hash }；local[id] = { hash, changedAt }
    return { userId, synced: {}, local: {}, deletes: [], uploaded: {}, imgDeletes: [], lastSync: 0 };
}

function loadCloudMeta() {
    try {
        return { ...freshCloudMeta(), ...JSON.parse(localStorage.getItem(CLOUD_META_KEY) || '{}') };
    } catch (_) {
        return freshCloudMeta();
    }
}

let cloudMeta = loadCloudMeta();

function saveCloudMeta() {
    try {
        localStorage.setItem(CLOUD_META_KEY, JSON.stringify(cloudMeta));
    } catch (_) {}
}

function cloudEnabled() {
    return !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey && window.supabase?.createClient);
}

// cyrb53：夠快，用嚟睇旅程有冇改過
function cloudHash(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function tripHash(t) {
    return cloudHash(JSON.stringify(t));
}

// 記低邊個旅程改過、幾時改
function cloudTrackChanges() {
    const now = Date.now();
    for (const t of data.trips) {
        const h = tripHash(t);
        if (cloudMeta.local[t.id]?.hash !== h) cloudMeta.local[t.id] = { hash: h, changedAt: now };
    }
}

function tripIsDirty(t) {
    return cloudMeta.local[t.id]?.hash !== cloudMeta.synced[t.id]?.hash;
}

// 新機開 app 自動有個空白「我的旅行」，雲端已經有旅程就唔好上傳佢
function isPristineTrip(t) {
    return (
        !cloudMeta.synced[t.id] &&
        !t.startDate &&
        t.itinerary.length === 1 &&
        t.itinerary[0].events.length === 0 &&
        !(t.stays || []).length &&
        !(t.docs || []).length &&
        ['我的旅行', '旅程'].includes(t.name)
    );
}

/* ── 由 app.js 呼叫嘅 hook ── */

function cloudOnSave() {
    if (!cloudUser || cloudApplying) return;
    cloudTrackChanges();
    saveCloudMeta();
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(cloudSync, CLOUD_PUSH_DELAY_MS);
}

function cloudOnTripDeleted(t) {
    if (!cloudUser || !t?.id) return;
    if (!cloudMeta.deletes.includes(t.id)) cloudMeta.deletes.push(t.id);
    const refs = [...t.itinerary.flatMap(dayImageRefs), ...t.docs.map((d) => d.url)];
    for (const ref of refs) {
        if (!isIdbRef(ref)) continue;
        const id = idbRefToId(ref);
        if (cloudMeta.uploaded[id]) cloudMeta.imgDeletes.push(id);
    }
    saveCloudMeta();
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(cloudSync, CLOUD_PUSH_DELAY_MS);
}

async function cloudFetchImage(id) {
    if (!cloudUser || !navigator.onLine || cloudImageMisses.has(id)) return null;
    try {
        const { data: blob, error } = await cloud.storage.from(CLOUD_BUCKET).download(`${cloudUser.id}/${id}`);
        if (error || !blob) throw error || new Error('no blob');
        const dataUrl = await readFileAsDataUrl(blob);
        await idbPut(id, dataUrl);
        cloudMeta.uploaded[id] = 1;
        saveCloudMeta();
        return dataUrl;
    } catch (_) {
        cloudImageMisses.add(id);
        return null;
    }
}

/* ── 同步 ── */

function setCloudState(state, error = '') {
    cloudState = state;
    cloudError = error;
    renderCloudUi();
}

async function cloudSync() {
    if (!cloud || !cloudUser) return;
    if (!navigator.onLine) {
        setCloudState('offline');
        return;
    }
    if (cloudSyncing) {
        cloudSyncAgain = true;
        return;
    }
    clearTimeout(cloudPushTimer);
    cloudSyncing = true;
    setCloudState('syncing');
    try {
        cloudTrackChanges();
        const changedUi = await cloudPullAndMerge();
        await cloudPushTrips();
        await cloudPushDeletes();
        await cloudSyncImages();
        cloudMeta.lastSync = Date.now();
        if (changedUi) cloudApplyToApp();
        setCloudState('idle');
    } catch (err) {
        console.warn('cloud sync failed', err);
        setCloudState(navigator.onLine ? 'error' : 'offline', err?.message || String(err));
    } finally {
        cloudSyncing = false;
        saveCloudMeta();
        if (cloudSyncAgain) {
            cloudSyncAgain = false;
            cloudSync();
        }
    }
}

async function cloudPullAndMerge() {
    const { data: rows, error } = await cloud.from('trips').select('id, data, updated_at, deleted');
    if (error) throw error;
    const activeId = trip.id;
    let changed = false;
    const byId = new Map(data.trips.map((t) => [t.id, t]));
    const replaceLocal = (id, next) => {
        const idx = data.trips.findIndex((t) => t.id === id);
        if (next) {
            if (idx >= 0) data.trips[idx] = next;
            else data.trips.push(next);
        } else if (idx >= 0) {
            data.trips.splice(idx, 1);
        }
        changed = true;
    };

    for (const row of rows) {
        const local = byId.get(row.id);
        const synced = cloudMeta.synced[row.id];
        const remoteChanged = !synced || synced.at !== row.updated_at;
        if (!remoteChanged) continue;
        const dirty = local ? tripIsDirty(local) : false;
        // 兩邊都改過：最後改嗰個贏
        const localWins = dirty && (cloudMeta.local[row.id]?.changedAt || 0) > Date.parse(row.updated_at);
        if (localWins) continue;
        // 編輯緊嗰個旅程唔好喺手底下換走，下次同步先處理
        if (row.id === activeId && isEdit && !travelMode && local) continue;

        if (row.deleted) {
            if (local) replaceLocal(row.id, null);
            cloudMeta.synced[row.id] = { at: row.updated_at, hash: '' };
            delete cloudMeta.local[row.id];
            continue;
        }
        if (cloudMeta.deletes.includes(row.id)) continue;
        const next = migrateTrip({ ...row.data, id: row.id });
        replaceLocal(row.id, next);
        const h = tripHash(next);
        cloudMeta.synced[row.id] = { at: row.updated_at, hash: h };
        cloudMeta.local[row.id] = { hash: h, changedAt: Date.parse(row.updated_at) };
    }

    // 雲端已經有旅程：新機嘅空白預設旅程唔要
    if (rows.some((r) => !r.deleted) && data.trips.length > 1) {
        for (const t of [...data.trips]) {
            if (isPristineTrip(t) && data.trips.length > 1) replaceLocal(t.id, null);
        }
    }
    if (!data.trips.length) data.trips.push(migrateTrip(defaultTrip()));

    if (changed) {
        const idx = data.trips.findIndex((t) => t.id === activeId);
        data.activeIdx = idx >= 0 ? idx : 0;
        trip = data.trips[data.activeIdx];
    }
    return changed;
}

async function cloudPushTrips() {
    const dirty = data.trips.filter((t) => tripIsDirty(t) && !isPristineTrip(t));
    if (!dirty.length) return;
    const rows = dirty.map((t) => ({
        id: t.id,
        data: t,
        updated_at: new Date(cloudMeta.local[t.id]?.changedAt || Date.now()).toISOString(),
        deleted: false,
    }));
    const { data: saved, error } = await cloud.from('trips').upsert(rows).select('id, updated_at');
    if (error) throw error;
    for (const r of saved) {
        const t = dirty.find((x) => x.id === r.id);
        if (t) cloudMeta.synced[r.id] = { at: r.updated_at, hash: tripHash(t) };
    }
}

async function cloudPushDeletes() {
    if (!cloudMeta.deletes.length) return;
    const ids = [...cloudMeta.deletes];
    const { data: saved, error } = await cloud
        .from('trips')
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .in('id', ids)
        .select('id, updated_at');
    if (error) throw error;
    for (const r of saved) cloudMeta.synced[r.id] = { at: r.updated_at, hash: '' };
    cloudMeta.deletes = cloudMeta.deletes.filter((id) => !ids.includes(id));
}

async function cloudSyncImages() {
    const uid = cloudUser.id;
    const used = collectUsedImageRefs(data);
    for (const id of used) {
        if (cloudMeta.uploaded[id]) continue;
        const dataUrl = await idbGet(id);
        if (!dataUrl) continue; // 本機冇：應該係另一部機上傳，用到時先下載
        const blob = await (await fetch(dataUrl)).blob();
        const { error } = await cloud.storage
            .from(CLOUD_BUCKET)
            .upload(`${uid}/${id}`, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
        if (error) throw error;
        cloudMeta.uploaded[id] = 1;
        saveCloudMeta();
    }
    if (cloudMeta.imgDeletes.length) {
        const ids = [...new Set(cloudMeta.imgDeletes)].filter((id) => !used.has(id));
        if (ids.length) {
            const { error } = await cloud.storage.from(CLOUD_BUCKET).remove(ids.map((id) => `${uid}/${id}`));
            if (error) throw error;
            ids.forEach((id) => delete cloudMeta.uploaded[id]);
        }
        cloudMeta.imgDeletes = [];
    }
}

// 雲端有新嘢：寫返本機，再重畫畫面（唔觸發再上傳）
function cloudApplyToApp() {
    cloudApplying = true;
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
        // 新機登入後拉到雲端旅程，就唔使再睇新手引導
        if (typeof finishOnboarding === 'function' && !data.trips.every(isPristineTrip)) finishOnboarding();
        if (curDayIdx >= trip.itinerary.length) curDayIdx = Math.max(0, trip.itinerary.length - 1);
        invalidateWeatherForecast();
        renderTripHeader();
        renderTripSelector();
        renderTripScheduleUI();
        renderCityUI();
        renderCurrencyUI();
        renderDaySelector();
        renderDay(curDayIdx);
        renderDocs();
        renderCheck();
        if (typeof renderStaysList === 'function') renderStaysList();
        updateHeaderSubtitle();
        fetchWeather();
    } finally {
        cloudApplying = false;
    }
}

/* ── 登入／登出 ── */

async function cloudSendLoginEmail() {
    const input = document.getElementById('cloud-email');
    const email = (input?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await modalAlert('Email 唔啱', '請輸入正確嘅 email');
        return;
    }
    const btn = document.getElementById('cloud-send-btn');
    if (btn) btn.disabled = true;
    try {
        const { error } = await cloud.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        cloudLoginEmail = email;
        renderCloudUi();
        showToast('登入連結已寄出 💌');
    } catch (err) {
        await modalAlert('寄唔到', err?.message || '請稍後再試');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// iPhone 加咗去主畫面嘅 app 撳信入面連結會開 Safari，所以亦支援輸入信入面嘅 6 位數字
async function cloudVerifyCode() {
    const code = (document.getElementById('cloud-code')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
        await modalAlert('驗證碼唔啱', '請輸入信入面嘅 6 位數字');
        return;
    }
    const { error } = await cloud.auth.verifyOtp({ email: cloudLoginEmail, token: code, type: 'email' });
    if (error) await modalAlert('登入唔到', error.message || '驗證碼可能過咗期，再寄一次啦');
}

async function cloudSignOut() {
    const ok = await modalConfirm('登出雲端同步', '登出之後呢部機嘅資料會保留，但唔會再同步。確定？', {
        confirmText: '登出',
    });
    if (!ok) return;
    await cloud.auth.signOut();
}

function cloudSetUser(user) {
    const switched = user?.id !== cloudUser?.id;
    cloudUser = user || null;
    if (cloudUser && cloudMeta.userId !== cloudUser.id) {
        cloudMeta = freshCloudMeta(cloudUser.id);
        saveCloudMeta();
    }
    if (!cloudUser) {
        setCloudState('signedout');
        return;
    }
    cloudLoginEmail = '';
    if (switched) cloudSync();
    else renderCloudUi();
}

async function cloudInit() {
    if (!cloudEnabled()) {
        setCloudState('off');
        return;
    }
    cloud = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    cloud.auth.onAuthStateChange((_event, session) => cloudSetUser(session?.user || null));
    const { data: sessionData } = await cloud.auth.getSession();
    cloudSetUser(sessionData?.session?.user || null);

    window.addEventListener('online', () => cloudSync());
    window.addEventListener('offline', () => cloudUser && setCloudState('offline'));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') cloudSync();
    });
    setInterval(() => {
        if (document.visibilityState === 'visible') cloudSync();
    }, CLOUD_POLL_MS);
}

/* ── 畫面 ── */

function cloudLastSyncText() {
    if (!cloudMeta.lastSync) return '未同步過';
    const mins = Math.round((Date.now() - cloudMeta.lastSync) / 60000);
    if (mins < 1) return '啱啱同步咗';
    if (mins < 60) return `${mins} 分鐘前同步`;
    return `上次同步：${new Date(cloudMeta.lastSync).toLocaleString('zh-TW')}`;
}

const CLOUD_CHIP = {
    idle: { text: '☁️ ✓', label: '雲端已同步' },
    syncing: { text: '☁️ …', label: '同步緊' },
    offline: { text: '☁️ 離線', label: '離線，有網絡會自動同步' },
    error: { text: '☁️ ⚠️', label: '同步出錯，撳入設定睇' },
};

function renderCloudUi() {
    const chip = document.getElementById('cloud-chip');
    const meta = CLOUD_CHIP[cloudState];
    if (chip) {
        chip.classList.toggle('hidden', !meta);
        chip.classList.toggle('is-syncing', cloudState === 'syncing');
        chip.classList.toggle('is-error', cloudState === 'error');
        if (meta) {
            chip.textContent = meta.text;
            chip.setAttribute('aria-label', meta.label);
            chip.title = meta.label;
        }
    }

    const card = document.getElementById('tools-cloud-card');
    if (!card) return;
    card.classList.toggle('hidden', cloudState === 'off');
    const out = document.getElementById('cloud-signed-out');
    const inn = document.getElementById('cloud-signed-in');
    out?.classList.toggle('hidden', !!cloudUser);
    inn?.classList.toggle('hidden', !cloudUser);
    document.getElementById('cloud-code-row')?.classList.toggle('hidden', !cloudLoginEmail);
    const sentTo = document.getElementById('cloud-sent-to');
    if (sentTo) sentTo.textContent = cloudLoginEmail ? `已寄去 ${cloudLoginEmail}，去信箱撳連結就登入。` : '';
    if (cloudUser) {
        document.getElementById('cloud-user-email').textContent = cloudUser.email || '';
        const status = document.getElementById('cloud-status');
        status.textContent =
            cloudState === 'syncing'
                ? '同步緊…'
                : cloudState === 'offline'
                  ? '離線中，有網絡會自動同步'
                  : cloudState === 'error'
                    ? `同步出錯：${cloudError}`
                    : cloudLastSyncText();
        status.classList.toggle('text-red-500', cloudState === 'error');
    }
}

window.addEventListener('load', () => setTimeout(cloudInit, 300));
