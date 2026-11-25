import {onReady} from './utils.js';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
/**
 * Money - Mô-đun Quản Lý Tiết Kiệm (tietkiem/js/app.js)
 * Hoạt động độc lập 100%, đồng bộ trực tiếp với bảng `savers` trên Supabase.
 */
(function() {
    'use strict';

    let saverClient = null;
    let currentUserId = null;
    let saverSubscription = null;
    let savers = [];
    let currentAdjustingSaverId = null;
    let currentAdjustingField = null;

    const SAVER_FIELD_NAMES = {
        momo: 'Tiền MoMo',
        bank: 'Tiền Ngân hàng',
        target: 'Mục tiêu tiền',
        debt: 'Tiền thiếu nợ'
    };

    

    function initSupabase() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            try {
                saverClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true },
                    realtime: { timeout: 5000 }
                });
                window.__QLCT_SUPABASE_CLIENT = saverClient;
            } catch (err) {
                console.warn('[Saver] Lỗi tạo Supabase client:', err);
            }
        }
    }

    function formatCurrency(num) {
        return (Number(num) || 0).toLocaleString('vi-VN') + ' VNĐ';
    }

    function parseAmountInput(val) {
        if (!val) return 0;
        const cleaned = String(val).replace(/\D/g, '');
        return cleaned ? parseInt(cleaned, 10) : 0;
    }

    let currentSortMode = 'custom';
    let draggingSaverId = null;

    function saveSaverData() {
        const storageKey = currentUserId ? `money_savers_${currentUserId}` : 'money_savers_local';
        try {
            localStorage.setItem(storageKey, JSON.stringify(savers));
        } catch (e) {
            console.warn('[Saver] Lỗi lưu LocalStorage:', e);
        }
    }

    function persistSaverOrder() {
        const storageKey = currentUserId ? `money_savers_order_${currentUserId}` : 'money_savers_order_local';
        try {
            const idOrder = savers.map(s => String(s.id));
            localStorage.setItem(storageKey, JSON.stringify(idOrder));
        } catch (e) {
            console.warn('[Saver] Lỗi lưu thứ tự:', e);
        }
    }

    function applyPersistedSaverOrder() {
        if (!Array.isArray(savers) || savers.length <= 1) return;
        const storageKey = currentUserId ? `money_savers_order_${currentUserId}` : 'money_savers_order_local';
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const idOrder = JSON.parse(raw);
            if (Array.isArray(idOrder) && idOrder.length > 0) {
                savers.sort((a, b) => {
                    const idxA = idOrder.indexOf(String(a.id));
                    const idxB = idOrder.indexOf(String(b.id));
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;
                    return 0;
                });
            }
        } catch (e) {
            console.warn('[Saver] Lỗi khôi phục thứ tự:', e);
        }
    }

    function loadSaverData() {
        const storageKey = currentUserId ? `money_savers_${currentUserId}` : 'money_savers_local';
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                savers = JSON.parse(raw);
                if (!Array.isArray(savers)) savers = [];
            } else {
                savers = [];
            }
        } catch (e) {
            console.warn('[Saver] Lỗi đọc LocalStorage:', e);
            savers = [];
        }
        applyPersistedSaverOrder();
        renderSaverTable();
    }

    async function fetchSaversFromSupabase() {
        if (!saverClient || !currentUserId) return;

        try {
            const { data, error } = await saverClient
                .from('savers')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('[Saver] Lỗi tải từ Supabase:', error.message);
                return;
            }

            if (data && Array.isArray(data)) {
                savers = data.map(item => ({
                    id: String(item.id),
                    title: item.title || '',
                    momo: Number(item.momo) || 0,
                    bank: Number(item.bank) || 0,
                    target: Number(item.target) || 0,
                    debt: Number(item.debt) || 0,
                    createdAt: item.created_at || new Date().toISOString()
                }));
                applyPersistedSaverOrder();
                saveSaverData();
                renderSaverTable();
            }
        } catch (err) {
            console.warn('[Saver] Lỗi kết nối:', err);
        }
    }

    async function syncSaverItemToSupabase(item) {
        if (!saverClient || !currentUserId || !item) return;

        try {
            const payload = {
                id: String(item.id),
                user_id: currentUserId,
                title: item.title,
                momo: Number(item.momo) || 0,
                bank: Number(item.bank) || 0,
                target: Number(item.target) || 0,
                debt: Number(item.debt) || 0,
                created_at: item.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await saverClient
                .from('savers')
                .upsert([payload], { onConflict: 'user_id,id' });
        } catch (e) {
            console.warn('[Saver] Lỗi sync item:', e);
        }
    }

    async function deleteSaverItemFromSupabase(id) {
        if (!saverClient || !currentUserId) return;

        try {
            await saverClient
                .from('savers')
                .delete()
                .eq('user_id', currentUserId)
                .eq('id', String(id));
        } catch (e) {
            console.warn('[Saver] Lỗi xóa item:', e);
        }
    }

    function setupSaverRealtime() {
        if (!saverClient || !currentUserId) return;

        if (saverSubscription) {
            try { saverSubscription.unsubscribe(); } catch(e){}
        }

        try {
            saverSubscription = saverClient
                .channel(`money-savers-realtime-${currentUserId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'savers',
                    filter: `user_id=eq.${currentUserId}`
                }, payload => {
                    handleRealtimeChange(payload);
                })
                .subscribe();
        } catch (e) {
            console.warn('[Saver] Lỗi setup realtime:', e);
        }
    }

    function handleRealtimeChange(payload) {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
            if (newRow && !savers.some(s => s.id === String(newRow.id))) {
                savers.unshift({
                    id: String(newRow.id),
                    title: newRow.title || '',
                    momo: Number(newRow.momo) || 0,
                    bank: Number(newRow.bank) || 0,
                    target: Number(newRow.target) || 0,
                    debt: Number(newRow.debt) || 0,
                    createdAt: newRow.created_at
                });
                saveSaverData();
                renderSaverTable();
            }
        } else if (eventType === 'UPDATE') {
            if (newRow) {
                const idx = savers.findIndex(s => s.id === String(newRow.id));
                if (idx !== -1) {
                    savers[idx] = {
                        id: String(newRow.id),
                        title: newRow.title || '',
                        momo: Number(newRow.momo) || 0,
                        bank: Number(newRow.bank) || 0,
                        target: Number(newRow.target) || 0,
                        debt: Number(newRow.debt) || 0,
                        createdAt: newRow.created_at
                    };
                    saveSaverData();
                    renderSaverTable();
                }
            }
        } else if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
                savers = savers.filter(s => s.id !== String(oldRow.id));
                saveSaverData();
                renderSaverTable();
            }
        }
    }

    function renderSaverTable() {
        const container = document.getElementById('saver-cards-container');
        if (!container) return;

        let totalMomo = 0;
        let totalBank = 0;
        let totalTarget = 0;
        let totalDebt = 0;

        // Calculate totals from ALL savers
        savers.forEach(item => {
            totalMomo += Number(item.momo) || 0;
            totalBank += Number(item.bank) || 0;
            totalTarget += Number(item.target) || 0;
            totalDebt += Number(item.debt) || 0;
        });

        if (savers.length === 0) {
            container.innerHTML = `
                <div class="saver-empty-state">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">💰</div>
                    <p style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">Chưa có mục tiết kiệm nào</p>
                    <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">Bấm nút <strong>(+)</strong> ở dưới để tạo mục đầu tiên.</p>
                </div>
            `;
            updateSaverSummary(0, 0, 0, 0);
            return;
        }

        // Apply search filter by title
        const searchInput = document.getElementById('saver-search-input');
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const filteredSavers = searchTerm
            ? savers.filter(s => (s.title || '').toLowerCase().includes(searchTerm))
            : savers;

        if (filteredSavers.length === 0 && searchTerm) {
            container.innerHTML = `
                <div class="saver-empty-state">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
                    <p style="font-weight: 700; color: var(--text-primary);">Không tìm thấy mục tiêu nào</p>
                    <p style="font-size: 0.78rem; color: var(--text-tertiary); margin-top: 4px;">Thử tìm kiếm với từ khóa khác</p>
                </div>
            `;
            updateSaverSummary(totalMomo, totalBank, totalTarget, totalDebt);
            return;
        }

        let html = '';
        filteredSavers.forEach((item, index) => {
            const momo = Number(item.momo) || 0;
            const bank = Number(item.bank) || 0;
            const target = Number(item.target) || 0;
            const debt = Number(item.debt) || 0;

            const savedAmount = momo + bank;
            let progressPercent = target > 0 ? (savedAmount / target * 100).toFixed(1) : 0;
            // Clean up .0 if whole number
            if (String(progressPercent).endsWith('.0')) {
                progressPercent = parseInt(progressPercent, 10);
            }

            const numPercent = Number(progressPercent) || 0;
            const percentStatusClass = numPercent >= 100 ? 'done' : (numPercent > 0 ? 'in-progress' : 'zero');
            const percentIconName = numPercent >= 100 ? 'check-circle' : 'trending-up';

            html += `
                <div class="saver-card" data-saver-id="${item.id}">
                    <div class="saver-card-header">
                        <div class="saver-card-title-row">
                            <div class="saver-card-icon-bubble">
                                <i data-lucide="bookmark"></i>
                            </div>
                            <span class="saver-card-title">${escapeHtml(item.title)}</span>
                        </div>
                        <div class="saver-card-actions">
                            ${target > 0 ? `
                                <span class="saver-card-percent-badge ${percentStatusClass}">
                                    <i data-lucide="${percentIconName}"></i>
                                    <span>${progressPercent}%</span>
                                </span>
                            ` : ''}
                            <div class="saver-card-btn-group">
                                <button type="button" class="saver-card-action-btn btn-move-up ${index === 0 ? 'disabled' : ''}" onclick="moveSaverItem('${item.id}', -1)" title="Di chuyển lên trên" aria-label="Lên">
                                    <i data-lucide="chevron-up"></i>
                                </button>
                                <button type="button" class="saver-card-action-btn btn-move-down ${index === filteredSavers.length - 1 ? 'disabled' : ''}" onclick="moveSaverItem('${item.id}', 1)" title="Di chuyển xuống dưới" aria-label="Xuống">
                                    <i data-lucide="chevron-down"></i>
                                </button>
                                <button type="button" class="saver-card-action-btn btn-edit" onclick="editSaverItem('${item.id}')" title="Sửa mục này" aria-label="Sửa">
                                    <i data-lucide="edit-2"></i>
                                </button>
                                <button type="button" class="saver-card-action-btn btn-delete" onclick="deleteSaverItem('${item.id}')" title="Xóa mục này" aria-label="Xóa">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    ${target > 0 ? `
                        <div class="saver-card-progress-wrap" title="Đã tiết kiệm ${formatCurrency(savedAmount)} / ${formatCurrency(target)} (${progressPercent}%)">
                            <div class="saver-card-progress-bar ${numPercent >= 100 ? 'done' : ''}" style="width: ${Math.min(100, Math.max(2, numPercent))}%;"></div>
                        </div>
                    ` : ''}

                    <div class="saver-card-grid">
                        <div class="saver-card-field">
                            <span class="saver-field-label">MOMO</span>
                            <button type="button" class="saver-field-value val-momo" onclick="openAdjustAmountModal('${item.id}', 'momo')" title="Bấm để điều chỉnh tiền MoMo">
                                <span>${formatCurrency(momo)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">NGÂN HÀNG</span>
                            <button type="button" class="saver-field-value val-bank" onclick="openAdjustAmountModal('${item.id}', 'bank')" title="Bấm để điều chỉnh tiền Ngân Hàng">
                                <span>${formatCurrency(bank)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">MỤC TIÊU</span>
                            <button type="button" class="saver-field-value val-target" onclick="openAdjustAmountModal('${item.id}', 'target')" title="Bấm để điều chỉnh Mục Tiêu">
                                <span>${formatCurrency(target)}</span>
                            </button>
                        </div>
                        <div class="saver-card-field">
                            <span class="saver-field-label">THIẾU NỢ</span>
                            <button type="button" class="saver-field-value ${debt > 0 ? 'val-debt-has' : 'val-debt-zero'}" onclick="openAdjustAmountModal('${item.id}', 'debt')" title="Bấm để điều chỉnh Thiếu NỢ">
                                <span>${formatCurrency(debt)}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        updateSaverSummary(totalMomo, totalBank, totalTarget, totalDebt);


        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function updateSaverSummary(momo, bank, target, debt) {
        const momoEl = document.getElementById('saver-sum-momo');
        const bankEl = document.getElementById('saver-sum-bank');
        const targetEl = document.getElementById('saver-sum-target');
        const debtEl = document.getElementById('saver-sum-debt');

        if (momoEl) momoEl.textContent = formatCurrency(momo);
        if (bankEl) bankEl.textContent = formatCurrency(bank);
        if (targetEl) targetEl.textContent = formatCurrency(target);
        if (debtEl) debtEl.textContent = formatCurrency(debt);
    }

    function updateSaverModalLivePreview() {
        const momo = parseAmountInput(document.getElementById('saver-input-momo')?.value || '0');
        const bank = parseAmountInput(document.getElementById('saver-input-bank')?.value || '0');
        const target = parseAmountInput(document.getElementById('saver-input-target')?.value || '0');

        const totalSaved = momo + bank;
        const totalEl = document.getElementById('saver-live-total-val');
        if (totalEl) totalEl.textContent = formatCurrency(totalSaved);

        const pctEl = document.getElementById('saver-live-percent-val');
        const fillEl = document.getElementById('saver-live-progress-fill');
        const remEl = document.getElementById('saver-live-remaining-val');

        if (target > 0) {
            let pct = (totalSaved / target * 100).toFixed(1);
            if (pct.endsWith('.0')) pct = parseInt(pct, 10);
            const numPct = Number(pct) || 0;
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (fillEl) {
                fillEl.style.width = `${Math.min(100, Math.max(0, numPct))}%`;
                if (numPct >= 100) {
                    fillEl.classList.add('done');
                } else {
                    fillEl.classList.remove('done');
                }
            }
            if (remEl) {
                if (totalSaved >= target) {
                    remEl.innerHTML = '<span style="color: #059669; font-weight: 800;">🎉 Đã hoàn thành 100% mục tiêu!</span>';
                } else {
                    remEl.textContent = `Còn thiếu ${formatCurrency(target - totalSaved)} để hoàn thành mục tiêu`;
                }
            }
        } else {
            if (pctEl) pctEl.textContent = '0%';
            if (fillEl) {
                fillEl.style.width = '0%';
                fillEl.classList.remove('done');
            }
            if (remEl) remEl.textContent = 'Chưa đặt mục tiêu';
        }
    }

    function selectSaverSuggestion(title) {
        const titleInput = document.getElementById('saver-input-title');
        if (titleInput) {
            titleInput.value = title;
            titleInput.focus();
        }
    }

    function setCustomAdjustInput(val) {
        const inputEl = document.getElementById('adjust-custom-input');
        if (inputEl) {
            inputEl.value = Number(val).toLocaleString('vi-VN');
            inputEl.focus();
        }
    }

    function openAddSaverModal() {
        document.getElementById('saver-item-id').value = '';
        document.getElementById('saver-input-title').value = '';
        document.getElementById('saver-input-momo').value = '';
        document.getElementById('saver-input-bank').value = '';
        document.getElementById('saver-input-target').value = '';
        document.getElementById('saver-input-debt').value = '';
        document.getElementById('add-saver-modal-title').textContent = 'Thêm mục tiết kiệm';
        const sub = document.getElementById('add-saver-modal-sub');
        if (sub) sub.textContent = 'Ghi nhận và theo dõi các khoản tích lũy theo từng nguồn tiền';

        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.add('active');
        document.getElementById('saver-input-title').focus();
        updateSaverModalLivePreview();
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function closeAddSaverModal() {
        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.remove('active');
    }

    function editSaverItem(id) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        document.getElementById('saver-item-id').value = item.id;
        document.getElementById('saver-input-title').value = item.title;
        document.getElementById('saver-input-momo').value = (item.momo || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-bank').value = (item.bank || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-target').value = (item.target || 0).toLocaleString('vi-VN');
        document.getElementById('saver-input-debt').value = (item.debt || 0).toLocaleString('vi-VN');
        document.getElementById('add-saver-modal-title').textContent = 'Chỉnh sửa mục tiết kiệm';
        const sub = document.getElementById('add-saver-modal-sub');
        if (sub) sub.textContent = 'Cập nhật lại thông tin & số dư cho mục này';

        const modalEl = document.getElementById('add-saver-modal');
        if (modalEl) modalEl.classList.add('active');
        updateSaverModalLivePreview();
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function deleteSaverItem(id) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        if (confirm(`Bạn có chắc muốn xóa mục tiết kiệm "${item.title}"?`)) {
            savers = savers.filter(s => s.id !== String(id));
            saveSaverData();
            renderSaverTable();
            deleteSaverItemFromSupabase(id);
        }
    }

    function handleSaveSaver(e) {
        if (e) e.preventDefault();

        const idField = document.getElementById('saver-item-id').value;
        const title = document.getElementById('saver-input-title').value.trim();
        const momo = parseAmountInput(document.getElementById('saver-input-momo').value);
        const bank = parseAmountInput(document.getElementById('saver-input-bank').value);
        const target = parseAmountInput(document.getElementById('saver-input-target').value);
        const debt = parseAmountInput(document.getElementById('saver-input-debt').value);

        if (!title) {
            alert('Vui lòng nhập tên mục tiết kiệm');
            return;
        }

        if (idField) {
            const idx = savers.findIndex(s => s.id === idField);
            if (idx !== -1) {
                savers[idx].title = title;
                savers[idx].momo = momo;
                savers[idx].bank = bank;
                savers[idx].target = target;
                savers[idx].debt = debt;
                syncSaverItemToSupabase(savers[idx]);
            }
        } else {
            const newItem = {
                id: 'saver_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                title: title,
                momo: momo,
                bank: bank,
                target: target,
                debt: debt,
                createdAt: new Date().toISOString()
            };
            savers.unshift(newItem);
            syncSaverItemToSupabase(newItem);
        }

        saveSaverData();
        renderSaverTable();
        closeAddSaverModal();
    }

    function openAdjustAmountModal(id, field) {
        const item = savers.find(s => s.id === String(id));
        if (!item) return;

        currentAdjustingSaverId = String(id);
        currentAdjustingField = field;

        const subtitleEl = document.getElementById('adjust-modal-subtitle');
        const currentValEl = document.getElementById('adjust-current-val');
        const customInputEl = document.getElementById('adjust-custom-input');

        const fieldLabel = SAVER_FIELD_NAMES[field] || field;
        if (subtitleEl) subtitleEl.textContent = `Mục: ${item.title} · ${fieldLabel}`;
        const badgeEl = document.getElementById('adjust-hero-field-badge');
        if (badgeEl) badgeEl.textContent = fieldLabel;
        const currentVal = Number(item[field]) || 0;
        if (currentValEl) currentValEl.textContent = currentVal.toLocaleString('vi-VN') + ' VNĐ';
        if (customInputEl) customInputEl.value = '';

        const modalEl = document.getElementById('adjust-saver-amount-modal');
        if (modalEl) modalEl.classList.add('active');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function closeAdjustAmountModal() {
        const modalEl = document.getElementById('adjust-saver-amount-modal');
        if (modalEl) modalEl.classList.remove('active');
        currentAdjustingSaverId = null;
        currentAdjustingField = null;
    }

    function quickAdjustAmount(delta) {
        if (!currentAdjustingSaverId || !currentAdjustingField) return;

        const item = savers.find(s => s.id === currentAdjustingSaverId);
        if (!item) return;

        let currentVal = Number(item[currentAdjustingField]) || 0;
        let nextVal = Math.max(0, currentVal + delta);
        item[currentAdjustingField] = nextVal;

        saveSaverData();
        renderSaverTable();
        syncSaverItemToSupabase(item);

        const currentValEl = document.getElementById('adjust-current-val');
        if (currentValEl) currentValEl.textContent = nextVal.toLocaleString('vi-VN') + ' VNĐ';
    }

    function applyCustomAdjust(action) {
        if (!currentAdjustingSaverId || !currentAdjustingField) return;

        const customInputEl = document.getElementById('adjust-custom-input');
        const customVal = parseAmountInput(customInputEl.value);

        const item = savers.find(s => s.id === currentAdjustingSaverId);
        if (!item) return;

        let currentVal = Number(item[currentAdjustingField]) || 0;
        let nextVal = currentVal;

        if (action === 'add') {
            nextVal = currentVal + customVal;
        } else if (action === 'sub') {
            nextVal = Math.max(0, currentVal - customVal);
        } else if (action === 'set') {
            nextVal = Math.max(0, customVal);
        }

        item[currentAdjustingField] = nextVal;
        saveSaverData();
        renderSaverTable();
        syncSaverItemToSupabase(item);
        closeAdjustAmountModal();
    }

    function formatNumberInput(inputEl) {
        if (!inputEl) return;
        inputEl.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
            } else {
                e.target.value = '';
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toggleSaverSearch() {
        const bar = document.getElementById('saver-search-bar');
        const input = document.getElementById('saver-search-input');
        if (!bar) return;
        if (bar.style.display === 'none' || !bar.style.display) {
            bar.style.display = 'block';
            if (input) {
                input.focus();
            }
        } else {
            bar.style.display = 'none';
            if (input) input.value = '';
            const clearBtn = document.getElementById('saver-search-clear');
            if (clearBtn) clearBtn.style.display = 'none';
            renderSaverTable();
        }
    }

    function filterSaverCards() {
        const input = document.getElementById('saver-search-input');
        const clearBtn = document.getElementById('saver-search-clear');
        if (clearBtn) {
            clearBtn.style.display = input && input.value.trim() ? 'flex' : 'none';
        }
        renderSaverTable();
    }

    function clearSaverSearch() {
        const input = document.getElementById('saver-search-input');
        const clearBtn = document.getElementById('saver-search-clear');
        if (input) {
            input.value = '';
            input.focus();
        }
        if (clearBtn) clearBtn.style.display = 'none';
        renderSaverTable();
    }

    // ========================================================================
    // SẮP XẾP VỊ TRÍ CÁC MỤC TIẾT KIỆM (DRAG & DROP, MOVE UP/DOWN, SORT MENU)
    // ========================================================================
    function bindSaverDragEvents(cardEl, handleEl, id) {
        // Desktop HTML5 drag & drop
        cardEl.addEventListener('dragstart', (e) => {
            draggingSaverId = id;
            cardEl.classList.add('saver-card-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
        });

        cardEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cardEl.classList.add('saver-card-drag-over');
        });

        cardEl.addEventListener('dragleave', () => {
            cardEl.classList.remove('saver-card-drag-over');
        });

        cardEl.addEventListener('drop', (e) => {
            e.preventDefault();
            cardEl.classList.remove('saver-card-drag-over');
            const sourceId = draggingSaverId || e.dataTransfer.getData('text/plain');
            if (sourceId && sourceId !== id) {
                reorderSavers(sourceId, id);
            }
        });

        cardEl.addEventListener('dragend', () => {
            draggingSaverId = null;
            cardEl.classList.remove('saver-card-dragging', 'saver-card-drag-over');
            document.querySelectorAll('.saver-card-drag-over').forEach(el => el.classList.remove('saver-card-drag-over'));
        });

        // Mobile touch / pointer drag support with haptics
        if (handleEl) {
            let pointerDragging = false;
            handleEl.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse') return;
                e.preventDefault();
                pointerDragging = true;
                draggingSaverId = id;
                cardEl.classList.add('saver-card-dragging');
                handleEl.setPointerCapture?.(e.pointerId);
                try { navigator.vibrate?.(15); } catch(_) {}
            });

            handleEl.addEventListener('pointermove', (e) => {
                if (!pointerDragging) return;
                const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.saver-card');
                if (!target || target === cardEl) return;
                const rect = target.getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) {
                    target.before(cardEl);
                } else {
                    target.after(cardEl);
                }
            });

            const finishPointerDrag = () => {
                if (!pointerDragging) return;
                pointerDragging = false;
                cardEl.classList.remove('saver-card-dragging');
                try { navigator.vibrate?.(10); } catch(_) {}
                syncSaverOrderFromDom();
            };

            handleEl.addEventListener('pointerup', finishPointerDrag);
            handleEl.addEventListener('pointercancel', finishPointerDrag);
        }
    }

    function reorderSavers(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return;
        const fromIdx = savers.findIndex(s => s.id === String(sourceId));
        const toIdx = savers.findIndex(s => s.id === String(targetId));
        if (fromIdx === -1 || toIdx === -1) return;

        const [moved] = savers.splice(fromIdx, 1);
        savers.splice(toIdx, 0, moved);

        currentSortMode = 'custom';
        updateSortChipsActive();
        saveSaverData();
        persistSaverOrder();
        renderSaverTable();
    }

    function syncSaverOrderFromDom() {
        const domIds = Array.from(document.querySelectorAll('#saver-cards-container .saver-card'))
            .map(el => el.dataset.saverId);
        if (domIds.length === 0) return;

        const byId = new Map(savers.map(s => [s.id, s]));
        const ordered = domIds.map(id => byId.get(id)).filter(Boolean);
        const inDom = new Set(domIds);
        savers.forEach(s => {
            if (!inDom.has(s.id)) ordered.push(s);
        });

        savers = ordered;
        currentSortMode = 'custom';
        updateSortChipsActive();
        saveSaverData();
        persistSaverOrder();
        renderSaverTable();
    }

    function moveSaverItem(id, direction) {
        const idx = savers.findIndex(s => s.id === String(id));
        if (idx === -1) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= savers.length) return;

        const temp = savers[idx];
        savers[idx] = savers[targetIdx];
        savers[targetIdx] = temp;

        currentSortMode = 'custom';
        updateSortChipsActive();
        saveSaverData();
        persistSaverOrder();
        renderSaverTable();
    }

    function toggleSaverSortMenu() {
        const bar = document.getElementById('saver-sort-bar');
        const btn = document.getElementById('btn-toggle-saver-sort');
        if (!bar) return;
        const isHidden = bar.style.display === 'none' || !bar.style.display;
        bar.style.display = isHidden ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', isHidden);
    }

    function applySaverSort(mode) {
        currentSortMode = mode;
        updateSortChipsActive();

        if (mode === 'saved-desc') {
            savers.sort((a, b) => ((Number(b.momo) || 0) + (Number(b.bank) || 0)) - ((Number(a.momo) || 0) + (Number(a.bank) || 0)));
        } else if (mode === 'percent-desc') {
            savers.sort((a, b) => {
                const pctA = Number(a.target) > 0 ? (((Number(a.momo) || 0) + (Number(a.bank) || 0)) / Number(a.target)) : 0;
                const pctB = Number(b.target) > 0 ? (((Number(b.momo) || 0) + (Number(b.bank) || 0)) / Number(b.target)) : 0;
                return pctB - pctA;
            });
        } else if (mode === 'target-desc') {
            savers.sort((a, b) => (Number(b.target) || 0) - (Number(a.target) || 0));
        } else if (mode === 'name-asc') {
            savers.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
        } else if (mode === 'newest') {
            savers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        } else if (mode === 'custom') {
            applyPersistedSaverOrder();
        }

        saveSaverData();
        persistSaverOrder();
        renderSaverTable();
    }

    function updateSortChipsActive() {
        document.querySelectorAll('#saver-sort-bar .saver-sort-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.sort === currentSortMode);
        });
    }

    window.openAddSaverModal = openAddSaverModal;
    window.closeAddSaverModal = closeAddSaverModal;
    window.editSaverItem = editSaverItem;
    window.deleteSaverItem = deleteSaverItem;
    window.openAdjustAmountModal = openAdjustAmountModal;
    window.closeAdjustAmountModal = closeAdjustAmountModal;
    window.quickAdjustAmount = quickAdjustAmount;
    window.applyCustomAdjust = applyCustomAdjust;
    window.toggleSaverSearch = toggleSaverSearch;
    window.filterSaverCards = filterSaverCards;
    window.clearSaverSearch = clearSaverSearch;
    window.updateSaverModalLivePreview = updateSaverModalLivePreview;
    window.selectSaverSuggestion = selectSaverSuggestion;
    window.setCustomAdjustInput = setCustomAdjustInput;
    window.moveSaverItem = moveSaverItem;
    window.toggleSaverSortMenu = toggleSaverSortMenu;
    window.applySaverSort = applySaverSort;

    function initApp() {
        initSupabase();

        if (saverClient) {
            saverClient.auth.getSession().then(({ data: { session } }) => {
                if (session && session.user) {
                    currentUserId = session.user.id;
                    loadSaverData();
                    fetchSaversFromSupabase();
                    setupSaverRealtime();
                } else {
                    currentUserId = null;
                    loadSaverData();
                }
            }).catch(e => {
                console.warn('[Saver] Auth check:', e);
                loadSaverData();
            });

            saverClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session && session.user ? session.user.id : null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                loadSaverData();
                if (currentUserId) {
                    fetchSaversFromSupabase();
                    setupSaverRealtime();
                }
            });
        } else {
            loadSaverData();
        }

        const form = document.getElementById('add-saver-form');
        if (form) form.addEventListener('submit', handleSaveSaver);

        ['saver-input-momo', 'saver-input-bank', 'saver-input-target', 'saver-input-debt', 'adjust-custom-input']
            .forEach(id => formatNumberInput(document.getElementById(id)));

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    if (document.readyState === 'loading') {
        onReady(initApp);
    } else {
        initApp();
    }
})();

export default function start() {}
