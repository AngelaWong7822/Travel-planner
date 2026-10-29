/* 備份 — 完整匯出（連相片）、匯入取代／合併；依賴 app.js 全域狀態與工具函式 */

const LAST_BACKUP_KEY = 'TRAVEL_APP_LAST_BACKUP';
let backupImportMode = 'merge';

function backupFileName() {
    return `旅行筆記備份-${formatISODate(new Date())}.json`;
}

// 將所有 idb: 圖片換成 base64，咁備份檔去到第二部機都還原到
async function inlineImageRefs(rootData) {
    const inline = async (ref) => (isIdbRef(ref) ? (await resolveImageUrl(ref)) || '' : ref);
    for (const t of rootData.trips) {
        for (const day of t.itinerary) {
            day.img = await inline(day.img);
            for (const ev of day.events) ev.img = await inline(ev.img);
            if (day.journal?.photos) {
                day.journal.photos = (await Promise.all(day.journal.photos.map(inline))).filter(Boolean);
            }
        }
        for (const doc of t.docs) doc.url = await inline(doc.url);
    }
}

async function buildBackupFile() {
    flushSave();
    const copy = JSON.parse(JSON.stringify(data));
    await inlineImageRefs(copy);
    copy.exportedAt = new Date().toISOString();
    const json = JSON.stringify(copy);
    return new File([json], backupFileName(), { type: 'application/json' });
}

function markBackupDone() {
    try {
        localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    } catch (_) {}
    renderBackupInfo();
}

function canShareBackupFiles() {
    try {
        return !!navigator.canShare?.({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
    } catch (_) {
        return false;
    }
}

function renderBackupInfo() {
    const el = document.getElementById('backup-last');
    if (el) {
        let last = '';
        try {
            last = localStorage.getItem(LAST_BACKUP_KEY) || '';
        } catch (_) {}
        el.textContent = last ? `上次匯出：${new Date(last).toLocaleString('zh-TW')}` : '未匯出過備份';
        el.classList.toggle('text-pink-500', !last);
    }
    document.getElementById('backup-share-btn')?.classList.toggle('hidden', !canShareBackupFiles());
}

async function exportBackup() {
    try {
        const file = await buildBackupFile();
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        markBackupDone();
        showToast(`已匯出備份（${formatBytes(file.size)}）`);
    } catch (err) {
        await modalAlert('匯出失敗', err.message || '匯出失敗');
    }
}

async function shareBackup() {
    try {
        const file = await buildBackupFile();
        await navigator.share({ files: [file], title: '旅行筆記備份' });
        markBackupDone();
    } catch (err) {
        if (err?.name === 'AbortError') return;
        await modalAlert('分享失敗', '可以改用「匯出備份」下載檔案');
    }
}

function startImport(mode) {
    backupImportMode = mode === 'replace' ? 'replace' : 'merge';
    document.getElementById('backup-file-input')?.click();
}

function parseBackupText(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (_) {
        throw new Error('檔案唔係有效嘅 JSON');
    }
    if (!raw || !Array.isArray(raw.trips) || !raw.trips.length) {
        throw new Error('呢個唔似係旅行筆記嘅備份檔（搵唔到旅程）');
    }
    return migrateRoot(raw);
}

async function importReplace(incoming) {
    const names = incoming.trips.map((t) => `「${t.name}」`).join('、');
    const ok = await modalConfirm(
        '匯入（取代）',
        `備份有 ${incoming.trips.length} 個旅程：${names}。會取代而家全部 ${data.trips.length} 個旅程同相片，確定？`,
        { danger: true, confirmText: '取代' },
    );
    if (!ok) return;
    const oldIds = await idbListAll();
    // 先存新相片同新資料，成功先刪舊相片；中途失敗舊資料仍然喺度
    await migrateDataUrlsToIdb(incoming);
    skipFlushSave = true;
    clearTimeout(saveTimer);
    saveTimer = null;
    localStorage.setItem(KEY, JSON.stringify(incoming));
    const keep = collectUsedImageRefs(incoming);
    for (const id of oldIds) {
        if (!keep.has(id)) await idbDelete(id).catch(() => {});
    }
    location.reload();
}

async function importMerge(incoming) {
    await migrateDataUrlsToIdb(incoming);
    flushSave();
    // 同一個備份合併兩次唔好撞 id（雲端同步靠 id 認旅程）
    const ids = new Set(data.trips.map((t) => t.id));
    incoming.trips.forEach((t) => {
        if (ids.has(t.id)) t.id = newTripId();
        ids.add(t.id);
    });
    data.trips.push(...incoming.trips);
    save();
    renderTripHeader();
    closeSettingsSheet();
    showToast(`已加入 ${incoming.trips.length} 個旅程`);
}

document.getElementById('backup-file-input')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
        const incoming = parseBackupText(await f.text());
        if (backupImportMode === 'replace') await importReplace(incoming);
        else await importMerge(incoming);
    } catch (err) {
        await modalAlert('匯入失敗', err.message || '匯入失敗');
    }
});
