/* 實際花費 — 每日記帳、預估 vs 實際；依賴 app.js 全域狀態與工具函式 */

let _expenseEdit = { dayIdx: 0, expIdx: null, cat: 'food' };

function expenseCat(id) {
    return EXPENSE_CATS.find((c) => c.id === id) || EXPENSE_CATS[EXPENSE_CATS.length - 1];
}

function dayExpenses(day) {
    if (!day) return [];
    if (!Array.isArray(day.expenses)) day.expenses = [];
    return day.expenses;
}

function sumExpenses(list) {
    return list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

function dayActualTotal(idx) {
    return sumExpenses(dayExpenses(trip.itinerary[idx]));
}

function tripActualTotal() {
    return trip.itinerary.reduce((s, d) => s + sumExpenses(dayExpenses(d)), 0);
}

function tripEstimateTotal() {
    const events = trip.itinerary.reduce((s, d) => s + sumEventCosts(d.events), 0);
    const stays = (trip.stays || []).reduce((s, st) => s + (Number(st.cost) || 0), 0);
    return events + stays;
}

function formatMoney(amount) {
    const n = Math.round((Number(amount) || 0) * 100) / 100;
    const sym = CURRENCY_SYMBOLS[tripLocalCurrency()];
    const val = n.toLocaleString('en-US');
    return sym ? `${sym}${val}` : `${val} ${tripLocalCurrency()}`;
}

// 有匯率先顯示約等於本國貨幣
function formatHomeHint(amount) {
    if (!trip.rate || !rateMatchesTripCurrencies()) return '';
    const home = tripHomeCurrency();
    const v = Math.round((Number(amount) || 0) * trip.rate);
    const sym = CURRENCY_SYMBOLS[home] || `${home} `;
    return `≈ ${sym}${v.toLocaleString('en-US')}`;
}

function renderDayExpenses(idx) {
    const el = document.getElementById('day-expenses');
    if (!el) return;
    const day = trip.itinerary[idx];
    if (!day || (isEdit && !travelMode)) {
        el.classList.add('hidden');
        return;
    }
    const list = dayExpenses(day);
    const actual = sumExpenses(list);
    const estimate = sumEventCosts(day.events);
    const over = estimate > 0 && actual > estimate;
    const rows = list
        .map((x, i) => {
            const cat = expenseCat(x.cat);
            return `<button type="button" class="expense-row" onclick="openExpenseSheet(${idx}, ${i})">
                <span class="expense-row-icon" aria-hidden="true">${cat.icon}</span>
                <span class="expense-row-note">${escapeHtml(x.note || cat.label)}</span>
                <span class="expense-row-amount">${escapeHtml(formatMoney(x.amount))}</span>
            </button>`;
        })
        .join('');
    el.innerHTML = `
        <div class="expense-head">
            <p class="expense-title"><i class="fas fa-wallet" aria-hidden="true"></i>今日花費</p>
            <button type="button" class="expense-add-btn" onclick="openExpenseSheet(${idx})"><i class="fas fa-plus" aria-hidden="true"></i>記一筆</button>
        </div>
        <p class="expense-summary${over ? ' expense-summary-over' : ''}">
            實際 <strong>${escapeHtml(formatMoney(actual))}</strong>
            ${estimate > 0 ? `／預估 ${escapeHtml(formatMoney(estimate))}` : ''}
            ${actual > 0 && formatHomeHint(actual) ? `<span class="expense-home">${escapeHtml(formatHomeHint(actual))}</span>` : ''}
        </p>
        ${rows ? `<div class="expense-list">${rows}</div>` : ''}`;
    el.classList.remove('hidden');
}

function renderDashboardSpend(dayIdx) {
    const el = document.getElementById('dashboard-spend');
    if (!el) return;
    if (dayIdx < 0 || !trip.itinerary[dayIdx]) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const actual = dayActualTotal(dayIdx);
    const estimate = sumEventCosts(trip.itinerary[dayIdx].events);
    const stayLine = typeof dashboardStayHtml === 'function' ? dashboardStayHtml(dayIdx) : '';
    el.innerHTML = `${stayLine}
        <div class="dashboard-spend-row">
            <span class="dashboard-spend-text"><i class="fas fa-wallet" aria-hidden="true"></i>今日已用 <strong>${escapeHtml(formatMoney(actual))}</strong>${estimate > 0 ? `<span class="text-muted">／預估 ${escapeHtml(formatMoney(estimate))}</span>` : ''}</span>
            <button type="button" class="expense-add-btn" onclick="openExpenseSheet(${dayIdx})"><i class="fas fa-plus" aria-hidden="true"></i>記一筆</button>
        </div>`;
    el.classList.remove('hidden');
}

function renderExpenseCats() {
    const wrap = document.getElementById('expense-cats');
    if (!wrap) return;
    wrap.innerHTML = EXPENSE_CATS.map(
        (c) => `<button type="button" class="expense-cat-btn${c.id === _expenseEdit.cat ? ' expense-cat-btn-active' : ''}" onclick="pickExpenseCat('${c.id}')" aria-pressed="${c.id === _expenseEdit.cat}">
            <span aria-hidden="true">${c.icon}</span>${c.label}</button>`,
    ).join('');
}

function pickExpenseCat(id) {
    _expenseEdit.cat = id;
    renderExpenseCats();
}

function openExpenseSheet(dayIdx, expIdx = null) {
    const day = trip.itinerary[dayIdx];
    if (!day) return;
    const x = expIdx != null ? dayExpenses(day)[expIdx] : null;
    _expenseEdit = { dayIdx, expIdx: x ? expIdx : null, cat: x ? x.cat : 'food' };
    document.getElementById('expense-sheet-title').textContent = x ? '改一筆' : '記一筆';
    document.getElementById('expense-currency').textContent = tripLocalCurrency();
    document.getElementById('expense-amount').value = x ? String(x.amount) : '';
    document.getElementById('expense-note').value = x ? x.note : '';
    const daySel = document.getElementById('expense-day');
    daySel.innerHTML = trip.itinerary
        .map((d, i) => `<option value="${i}"${i === dayIdx ? ' selected' : ''}>${escapeHtml(weatherDaySelectLabel(i))}</option>`)
        .join('');
    document.getElementById('expense-delete-btn').classList.toggle('hidden', !x);
    renderExpenseCats();
    document.getElementById('expense-sheet').classList.remove('hidden');
    setTimeout(() => document.getElementById('expense-amount')?.focus(), 50);
}

function closeExpenseSheet() {
    document.getElementById('expense-sheet')?.classList.add('hidden');
}

function refreshSpendViews() {
    renderDayExpenses(curDayIdx);
    if (isTodayTabActive() && typeof renderTravelDashboard === 'function') renderTravelDashboard();
    if (isToolsTabActive()) renderSpendSummary();
}

async function saveExpenseFromSheet() {
    const amount = Number(document.getElementById('expense-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
        await modalAlert('未填金額', '請輸入大過 0 嘅金額');
        return;
    }
    const entry = migrateExpense({
        amount,
        cat: _expenseEdit.cat,
        note: document.getElementById('expense-note').value.trim(),
        ts: Date.now(),
    });
    const targetIdx = parseInt(document.getElementById('expense-day').value, 10);
    const { dayIdx, expIdx } = _expenseEdit;
    if (expIdx != null) {
        const old = dayExpenses(trip.itinerary[dayIdx])[expIdx];
        entry.ts = old?.ts ?? entry.ts;
        dayExpenses(trip.itinerary[dayIdx]).splice(expIdx, 1);
    }
    dayExpenses(trip.itinerary[targetIdx]).push(entry);
    save();
    closeExpenseSheet();
    refreshSpendViews();
    showToast(expIdx != null ? '已更新' : `已記 ${formatMoney(amount)}`);
}

async function deleteExpenseFromSheet() {
    const { dayIdx, expIdx } = _expenseEdit;
    if (expIdx == null) return;
    if (!(await modalConfirm('刪除呢筆', '確定刪除？', { danger: true, confirmText: '刪除' }))) return;
    dayExpenses(trip.itinerary[dayIdx]).splice(expIdx, 1);
    save();
    closeExpenseSheet();
    refreshSpendViews();
}

function onTripBudgetInput(v) {
    const n = Number(v);
    trip.tripBudget = v === '' || !Number.isFinite(n) || n <= 0 ? null : n;
    debouncedSave();
    renderSpendSummary({ keepBudgetInput: true });
}

function renderSpendSummary(opts = {}) {
    if (!document.getElementById('tools-spend-card')) return;
    const actual = tripActualTotal();
    const estimate = tripEstimateTotal();
    const budget = trip.tripBudget;
    const cap = budget || estimate;
    const pct = cap > 0 ? Math.min(100, Math.round((actual / cap) * 100)) : 0;
    const over = cap > 0 && actual > cap;

    const byCat = EXPENSE_CATS.map((c) => ({
        ...c,
        total: trip.itinerary.reduce(
            (s, d) => s + sumExpenses(dayExpenses(d).filter((x) => x.cat === c.id)),
            0,
        ),
    })).filter((c) => c.total > 0);
    const maxCat = Math.max(1, ...byCat.map((c) => c.total));
    const catRows = byCat
        .map(
            (c) => `<div class="spend-cat-row">
                <span class="spend-cat-label">${c.icon} ${c.label}</span>
                <span class="spend-cat-bar"><span style="width:${Math.round((c.total / maxCat) * 100)}%"></span></span>
                <span class="spend-cat-amount">${escapeHtml(formatMoney(c.total))}</span>
            </div>`,
        )
        .join('');
    const dayRows = trip.itinerary
        .map((d, i) => ({ i, a: sumExpenses(dayExpenses(d)), e: sumEventCosts(d.events) }))
        .filter((r) => r.a > 0 || r.e > 0)
        .map(
            (r) => `<button type="button" class="spend-day-row" onclick="setTab('itinerary');renderDay(${r.i})">
                <span>${escapeHtml(weatherDaySelectLabel(r.i))}</span>
                <span class="${r.e > 0 && r.a > r.e ? 'text-red-500' : ''}">${escapeHtml(formatMoney(r.a))}${r.e > 0 ? `<span class="text-muted">／${escapeHtml(formatPillAmount(r.e))}</span>` : ''}</span>
            </button>`,
        )
        .join('');

    const totals = document.getElementById('spend-totals');
    if (totals) {
        totals.innerHTML = `
            <p class="spend-actual">${escapeHtml(formatMoney(actual))}</p>
            <p class="spend-sub">${budget ? `預算 ${escapeHtml(formatMoney(budget))}` : `預估 ${escapeHtml(formatMoney(estimate))}`}${formatHomeHint(actual) ? ` · 實際${escapeHtml(formatHomeHint(actual))}` : ''}</p>
            ${cap > 0 ? `<div class="progress-track mt-2"><div class="progress-fill${over ? ' spend-over' : ''}" style="width:${pct}%"></div></div>` : ''}`;
    }
    const budgetInput = document.getElementById('trip-budget-input');
    if (budgetInput && !opts.keepBudgetInput) budgetInput.value = budget ? String(budget) : '';
    const curEl = document.getElementById('trip-budget-currency');
    if (curEl) curEl.textContent = tripLocalCurrency();

    const detail = document.getElementById('spend-detail');
    if (detail) {
        detail.innerHTML = catRows || dayRows
            ? `${catRows ? `<div class="spend-cats">${catRows}</div>` : ''}${dayRows ? `<p class="spend-section-label">每日（實際／預估）</p><div class="spend-days">${dayRows}</div>` : ''}`
            : '<p class="type-caption text-muted">未有記帳，喺行程或今日頁撳「記一筆」</p>';
    }
}
