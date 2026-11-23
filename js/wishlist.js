import {initNavigation,pushAppView,leaveAppView} from './navigation.js';
import {createLucideIcons,normalizeSupportText,normalizeDuplicateText,goBackToHome as showLoginScreen} from './utils.js';
import {getClient} from './api.js';
const state = {
    wishlistEntries: [],
    wishlistSelectionMode: null,
    wishlistEditingEntryId: null,
    wishlistStorageMode: 'supabase',
    wishlistCurrentTab: 'pending',
    wishlistJustMovedId: null,
    currentUserId: null
};
let supabaseClient;
function openWishlistModal() {
    const modal = document.getElementById('wishlist-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    state.wishlistSelectionMode = null;
    state.wishlistCurrentTab = 'pending';
    document.getElementById('btn-edit-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    pushAppView('wishlist-modal');
    fetchWishlistEntries();
    createLucideIcons();
}

function closeWishlistModal(returnToHub = true, fromHistory = false) {
    const modal = document.getElementById('wishlist-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.wishlistSelectionMode = null;
    document.getElementById('btn-edit-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    if (returnToHub && !fromHistory) leaveAppView();
}

function isMissingWishlistTable(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205'
        || code === '42P01'
        || message.includes("could not find the table 'public.wishlist_entries'")
        || message.includes('relation "wishlist_entries" does not exist');
}

function getWishlistLocalStorageKey() {
    return state.currentUserId ? `qlct_wishlist_${state.currentUserId}` : 'qlct_wishlist';
}

function loadLocalWishlistEntries() {
    try {
        const raw = localStorage.getItem(getWishlistLocalStorageKey());
        const entries = raw ? JSON.parse(raw) : [];
        return Array.isArray(entries) ? entries : [];
    } catch (error) {
        console.warn('Không thể đọc Wishlist tạm:', error);
        return [];
    }
}

function saveLocalWishlistEntries(entries) {
    localStorage.setItem(getWishlistLocalStorageKey(), JSON.stringify(entries));
}

function getWishlistBoughtKey() {
    return state.currentUserId ? `qlct_wishlist_bought_${state.currentUserId}` : 'qlct_wishlist_bought';
}

function loadWishlistBoughtMap() {
    try {
        const raw = localStorage.getItem(getWishlistBoughtKey());
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveWishlistBoughtMap(map) {
    try {
        localStorage.setItem(getWishlistBoughtKey(), JSON.stringify(map));
    } catch (e) {
        console.warn('Không thể lưu trạng thái đã mua Wishlist:', e);
    }
}

function isWishlistEntryBought(entry) {
    if (!entry) return false;
    if (entry.is_bought !== undefined && entry.is_bought !== null) return Boolean(entry.is_bought);
    const boughtMap = loadWishlistBoughtMap();
    return Boolean(boughtMap[entry.id]);
}

function setWishlistNotice(message = '') {
    const notice = document.getElementById('wishlist-storage-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
}

function setWishlistFormError(message = '') {
    const errorEl = document.getElementById('wishlist-entry-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
}

function setWishlistTab(tab) {
    state.wishlistCurrentTab = tab === 'bought' ? 'bought' : 'pending';
    state.wishlistSelectionMode = null;
    document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    renderWishlistEntries();
}

function renderWishlistEntries() {
    const tbody = document.getElementById('wishlist-table-body');
    const countEl = document.getElementById('wishlist-entry-count');
    const pendingBadge = document.getElementById('wishlist-tab-badge-pending');
    const boughtBadge = document.getElementById('wishlist-tab-badge-bought');
    const btnTabPending = document.getElementById('btn-wishlist-tab-pending');
    const btnTabBought = document.getElementById('btn-wishlist-tab-bought');
    const thRank = document.getElementById('wishlist-th-rank');

    if (!tbody) return;

    tbody.replaceChildren();
    const allEntries = state.wishlistEntries || [];
    const pendingEntries = allEntries.filter(entry => !isWishlistEntryBought(entry));
    const boughtEntries = allEntries.filter(entry => isWishlistEntryBought(entry));

    if (pendingBadge) pendingBadge.textContent = pendingEntries.length;
    if (boughtBadge) boughtBadge.textContent = boughtEntries.length;

    const isBoughtTab = state.wishlistCurrentTab === 'bought';
    if (btnTabPending) {
        btnTabPending.classList.toggle('active', !isBoughtTab);
        btnTabPending.setAttribute('aria-selected', !isBoughtTab ? 'true' : 'false');
    }
    if (btnTabBought) {
        btnTabBought.classList.toggle('active', isBoughtTab);
        btnTabBought.setAttribute('aria-selected', isBoughtTab ? 'true' : 'false');
    }

    if (thRank) {
        thRank.textContent = isBoughtTab ? 'XONG' : 'TOP';
    }

    const currentEntries = isBoughtTab ? boughtEntries : pendingEntries;
    if (countEl) countEl.textContent = currentEntries.length;

    if (!currentEntries.length) {
        const row = document.createElement('tr');
        row.className = 'support-empty-row';
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.innerHTML = isBoughtTab ? `
            <div class="support-empty-state wishlist-empty-state">
                <span class="support-empty-icon wishlist-empty-icon" style="color: #10B981; background: rgba(16, 185, 129, 0.1);">
                    <i data-lucide="check-circle-2"></i>
                </span>
                <strong>Chưa có mục nào đã mua</strong>
                <p>Khi hoàn thành điều mong ước ở mục Wishlist, hãy bấm “Đã mua” để lưu dấu tại đây.</p>
            </div>
        ` : `
            <div class="support-empty-state wishlist-empty-state">
                <span class="support-empty-icon wishlist-empty-icon">
                    <i data-lucide="heart"></i>
                </span>
                <strong>Chưa có mục nào trong Wishlist</strong>
                <p>Bấm “+ Thêm mới” để lưu lại điều bạn mong muốn thực hiện.</p>
            </div>
        `;
        row.appendChild(cell);
        tbody.appendChild(row);
        createLucideIcons();
        return;
    }

    const isSelecting = Boolean(state.wishlistSelectionMode);

    currentEntries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.dataset.wishlistId = entry.id;
        row.className = `wishlist-table-row ${isBoughtTab ? 'is-bought' : ''} ${entry.id === state.wishlistJustMovedId ? 'wishlist-row-highlight' : ''}`;
        if (!isSelecting && !isBoughtTab) {
            row.draggable = true;
        }

        // Cột 1: Huy hiệu Rank TOP hoặc Check Badge Đã mua
        const rankCell = document.createElement('td');
        rankCell.className = 'wishlist-rank-cell';
        const rank = document.createElement('span');
        if (isBoughtTab) {
            rank.className = 'wishlist-rank wishlist-rank-bought';
            rank.innerHTML = '<i data-lucide="check"></i>';
            rank.title = 'Đã hoàn thành / Đã mua';
        } else {
            const rankNum = index + 1;
            rank.className = `wishlist-rank ${rankNum <= 3 ? `wishlist-rank-top${rankNum}` : ''}`;
            rank.textContent = String(rankNum);
        }
        rankCell.appendChild(rank);

        // Cột 2: Tiêu đề & Nội dung Wishlist
        const titleCell = document.createElement('td');
        titleCell.className = 'wishlist-title-cell';
        const titleText = document.createElement('span');
        titleText.className = `wishlist-title-text ${isBoughtTab ? 'is-bought' : ''}`;
        titleText.textContent = entry.title || '';
        titleCell.appendChild(titleText);

        // Cột 3: Nút Thao tác (Đã mua / Chưa mua, Kéo thả, hoặc Xóa)
        const actionCell = document.createElement('td');
        actionCell.className = 'wishlist-action-cell';

        if (isSelecting) {
            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'support-row-select wishlist-row-select';
            selectButton.title = 'Xóa mục này';
            selectButton.setAttribute('aria-label', selectButton.title);
            selectButton.innerHTML = '<i data-lucide="trash-2"></i>';
            selectButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleWishlistEntrySelection(entry.id);
            });
            actionCell.appendChild(selectButton);
        } else {
            const actionWrap = document.createElement('div');
            actionWrap.className = 'wishlist-row-actions';

            if (!isBoughtTab) {
                // Nút "Đã mua" -> chuyển sang tab Đã mua
                const buyBtn = document.createElement('button');
                buyBtn.type = 'button';
                buyBtn.className = 'wishlist-buy-btn';
                buyBtn.title = 'Đánh dấu đã mua và chuyển sang tab Đã mua';
                buyBtn.setAttribute('aria-label', 'Đã mua');
                buyBtn.innerHTML = '<i data-lucide="check"></i><span class="wishlist-buy-btn-text">Đã mua</span>';
                buyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleWishlistEntryBought(entry.id, true);
                });
                actionWrap.appendChild(buyBtn);

                // Nút Kéo thả
                const handle = document.createElement('button');
                handle.type = 'button';
                handle.className = 'wishlist-drag-handle';
                handle.title = 'Kéo để đổi thứ tự TOP';
                handle.setAttribute('aria-label', handle.title);
                handle.innerHTML = '<i data-lucide="grip-vertical"></i>';
                actionWrap.appendChild(handle);
                bindWishlistDrag(row, handle, entry.id);
            } else {
                // Nút "Chưa mua" -> chuyển lại về mục Wishlist
                const unbuyBtn = document.createElement('button');
                unbuyBtn.type = 'button';
                unbuyBtn.className = 'wishlist-unbuy-btn';
                unbuyBtn.title = 'Chuyển lại về mục Wishlist';
                unbuyBtn.setAttribute('aria-label', 'Chuyển lại về Wishlist');
                unbuyBtn.innerHTML = '<i data-lucide="rotate-ccw"></i><span class="wishlist-unbuy-btn-text">Chưa mua</span>';
                unbuyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleWishlistEntryBought(entry.id, false);
                });
                actionWrap.appendChild(unbuyBtn);
            }

            actionCell.appendChild(actionWrap);
        }

        row.append(rankCell, titleCell, actionCell);

        // Chạm vào hàng để chỉnh sửa nhanh
        row.addEventListener('click', (e) => {
            if (e.target.closest('.wishlist-drag-handle')) return;
            if (e.target.closest('.wishlist-row-select')) return;
            if (e.target.closest('.wishlist-buy-btn')) return;
            if (e.target.closest('.wishlist-unbuy-btn')) return;
            if (state.wishlistDraggingId) return;

            if (state.wishlistSelectionMode === 'delete') {
                deleteWishlistEntry(entry.id);
            } else {
                openWishlistEntryModal(entry.id);
            }
        });

        tbody.appendChild(row);
    });

    createLucideIcons();
}

async function toggleWishlistEntryBought(id, targetBought = null) {
    if (!id) return;
    const entry = state.wishlistEntries.find(item => item.id === id);
    if (!entry) return;

    const nextBought = targetBought !== null ? Boolean(targetBought) : !isWishlistEntryBought(entry);
    entry.is_bought = nextBought;

    // Cập nhật bản đồ lưu trữ cục bộ
    const boughtMap = loadWishlistBoughtMap();
    if (nextBought) boughtMap[id] = true;
    else delete boughtMap[id];
    saveWishlistBoughtMap(boughtMap);

    if (state.wishlistStorageMode === 'local') {
        const entries = loadLocalWishlistEntries();
        const index = entries.findIndex(e => e.id === id);
        if (index >= 0) {
            entries[index] = { ...entries[index], is_bought: nextBought, updated_at: new Date().toISOString() };
            saveLocalWishlistEntries(entries);
        }
    }

    // Chuyển sang tab đích theo yêu cầu của người dùng
    state.wishlistCurrentTab = nextBought ? 'bought' : 'pending';
    state.wishlistJustMovedId = id;
    setTimeout(() => {
        if (state.wishlistJustMovedId === id) {
            state.wishlistJustMovedId = null;
            const row = document.querySelector(`tr[data-wishlist-id="${id}"]`);
            row?.classList.remove('wishlist-row-highlight');
        }
    }, 2000);

    // Kích hoạt pháo hoa ăn mừng khi vừa hoàn thành món đã mua
    if (nextBought && typeof confetti === 'function') {
        try {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.6 }
            });
        } catch (_) {}
    }

    renderWishlistEntries();

    // Đồng bộ lên Supabase nếu có kết nối
    if (supabaseClient && state.currentUserId && state.wishlistStorageMode !== 'local') {
        try {
            const { error } = await supabaseClient
                .from('wishlist_entries')
                .update({ is_bought: nextBought, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', state.currentUserId);
            if (error) {
                console.warn('Lưu Supabase is_bought không thành công (đã lưu trên thiết bị):', error.message);
            }
        } catch (err) {
            console.warn('Lỗi kết nối Supabase khi cập nhật Wishlist is_bought:', err);
        }
    }
}

function setWishlistSelectionMode(mode) {
    state.wishlistSelectionMode = state.wishlistSelectionMode === mode ? null : mode;
    const deleteButton = document.getElementById('btn-delete-wishlist-entry');
    if (deleteButton) deleteButton.setAttribute('aria-pressed', state.wishlistSelectionMode === 'delete' ? 'true' : 'false');
    renderWishlistEntries();
}

function handleWishlistEntrySelection(id) {
    if (!id || !state.wishlistSelectionMode) return;
    if (state.wishlistSelectionMode === 'edit') {
        openWishlistEntryModal(id);
    } else {
        deleteWishlistEntry(id);
    }
}

async function deleteWishlistEntry(id) {
    if (!id) return;
    const entry = state.wishlistEntries.find(item => item.id === id);
    const label = entry?.title ? ` “${entry.title}”` : '';
    if (!confirm(`Bạn có chắc muốn xóa Wishlist${label} không?`)) return;

    // Dọn dẹp bản đồ trạng thái đã mua nếu có
    const boughtMap = loadWishlistBoughtMap();
    if (boughtMap[id]) {
        delete boughtMap[id];
        saveWishlistBoughtMap(boughtMap);
    }

    if (state.wishlistStorageMode === 'local') {
        const entries = loadLocalWishlistEntries().filter(item => item.id !== id);
        saveLocalWishlistEntries(entries);
        state.wishlistEntries = entries;
        state.wishlistSelectionMode = null;
        document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
        renderWishlistEntries();
        persistWishlistOrder();
        return;
    }

    if (!supabaseClient || !state.currentUserId) return;
    const { error } = await supabaseClient
        .from('wishlist_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', state.currentUserId);

    if (error) {
        if (isMissingWishlistTable(error)) {
            state.wishlistStorageMode = 'local';
            const entries = loadLocalWishlistEntries().filter(item => item.id !== id);
            saveLocalWishlistEntries(entries);
            state.wishlistEntries = entries;
            setWishlistNotice('Chưa có bảng wishlist_entries. Wishlist đang được lưu tạm trên thiết bị.');
        } else {
            console.error('Không thể xóa Wishlist:', error);
            alert('Không thể xóa Wishlist. Vui lòng thử lại.');
            return;
        }
    } else {
        state.wishlistEntries = state.wishlistEntries.filter(item => item.id !== id);
    }

    state.wishlistSelectionMode = null;
    document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    renderWishlistEntries();
    persistWishlistOrder();
}

function bindWishlistDrag(row, handle, entryId) {
    row.addEventListener('dragstart', event => {
        state.wishlistDraggingId = entryId;
        row.classList.add('wishlist-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', entryId);
    });
    row.addEventListener('dragover', event => {
        event.preventDefault();
        row.classList.add('wishlist-drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('wishlist-drag-over'));
    row.addEventListener('drop', event => {
        event.preventDefault();
        row.classList.remove('wishlist-drag-over');
        reorderWishlistEntries(state.wishlistDraggingId || event.dataTransfer.getData('text/plain'), entryId);
    });
    row.addEventListener('dragend', () => {
        state.wishlistDraggingId = null;
        row.classList.remove('wishlist-dragging', 'wishlist-drag-over');
        document.querySelectorAll('.wishlist-drag-over').forEach(item => item.classList.remove('wishlist-drag-over'));
    });

    // Hỗ trợ kéo trên màn hình cảm ứng/PWA với phản hồi xúc giác nhẹ (Haptics)
    let pointerDragging = false;
    handle.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        event.preventDefault();
        pointerDragging = true;
        state.wishlistDraggingId = entryId;
        row.classList.add('wishlist-dragging');
        handle.setPointerCapture?.(event.pointerId);
        try { navigator.vibrate?.(15); } catch (_) {}
    });
    handle.addEventListener('pointermove', event => {
        if (!pointerDragging) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('#wishlist-table-body tr');
        if (!target || target === row) return;
        const rect = target.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) target.before(row);
        else target.after(row);
    });
    const finishPointerDrag = () => {
        if (!pointerDragging) return;
        pointerDragging = false;
        row.classList.remove('wishlist-dragging');
        try { navigator.vibrate?.(10); } catch (_) {}
        syncWishlistOrderFromDom();
    };
    handle.addEventListener('pointerup', finishPointerDrag);
    handle.addEventListener('pointercancel', finishPointerDrag);
}

function reorderWishlistEntries(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const entries = [...state.wishlistEntries];
    const fromIndex = entries.findIndex(entry => entry.id === draggedId);
    const toIndex = entries.findIndex(entry => entry.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, moved);
    state.wishlistEntries = entries;
    renderWishlistEntries();
    persistWishlistOrder();
}

function syncWishlistOrderFromDom() {
    const ids = Array.from(document.querySelectorAll('#wishlist-table-body tr[data-wishlist-id]'))
        .map(row => row.dataset.wishlistId);
    const byId = new Map(state.wishlistEntries.map(entry => [entry.id, entry]));
    const visibleMoved = ids.map(id => byId.get(id)).filter(Boolean);
    const remaining = state.wishlistEntries.filter(entry => !ids.includes(entry.id));
    state.wishlistEntries = [...visibleMoved, ...remaining];
    renderWishlistEntries();
    persistWishlistOrder();
}

async function persistWishlistOrder() {
    state.wishlistEntries.forEach((entry, index) => { entry.display_order = index + 1; });
    if (state.wishlistStorageMode === 'local') {
        saveLocalWishlistEntries(state.wishlistEntries);
        return;
    }
    if (!supabaseClient || !state.currentUserId) return;
    const results = await Promise.all(state.wishlistEntries.map((entry, index) =>
        supabaseClient.from('wishlist_entries').update({ display_order: index + 1 }).eq('id', entry.id).eq('user_id', state.currentUserId)
    ));
    const error = results.find(result => result.error)?.error;
    if (error) console.error('Không thể lưu thứ tự Wishlist:', error);
}

async function fetchWishlistEntries() {
    const boughtMap = loadWishlistBoughtMap();
    if (!supabaseClient || !state.currentUserId) {
        state.wishlistStorageMode = 'local';
        state.wishlistEntries = loadLocalWishlistEntries().map(entry => ({
            ...entry,
            is_bought: entry.is_bought !== undefined ? Boolean(entry.is_bought) : Boolean(boughtMap[entry.id])
        }));
        setWishlistNotice('Chưa có phiên Supabase. Wishlist sẽ được lưu tạm trên thiết bị này.');
        renderWishlistEntries();
        return;
    }

    let queryResult = await supabaseClient
        .from('wishlist_entries')
        .select('id,title,display_order,is_bought,created_at,updated_at')
        .eq('user_id', state.currentUserId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (queryResult.error && (String(queryResult.error.message || '').includes('is_bought') || queryResult.error.code === '42703')) {
        queryResult = await supabaseClient
            .from('wishlist_entries')
            .select('id,title,display_order,created_at,updated_at')
            .eq('user_id', state.currentUserId)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });
    }

    const { data, error } = queryResult;
    if (error) {
        if (isMissingWishlistTable(error)) {
            state.wishlistStorageMode = 'local';
            state.wishlistEntries = loadLocalWishlistEntries().map(entry => ({
                ...entry,
                is_bought: entry.is_bought !== undefined ? Boolean(entry.is_bought) : Boolean(boughtMap[entry.id])
            }));
            setWishlistNotice('Chưa có bảng wishlist_entries. Hãy chạy file SQL Wishlist để đồng bộ Supabase.');
        } else {
            console.error('Không thể tải Wishlist:', error);
            state.wishlistEntries = [];
            setWishlistNotice(error.message || 'Không thể tải Wishlist.');
        }
    } else {
        state.wishlistStorageMode = 'supabase';
        state.wishlistEntries = (data || []).map(entry => ({
            ...entry,
            is_bought: entry.is_bought !== undefined ? Boolean(entry.is_bought) : Boolean(boughtMap[entry.id])
        }));
        setWishlistNotice('');
    }
    renderWishlistEntries();
}

function openWishlistEntryModal(entryId = null) {
    const modal = document.getElementById('wishlist-entry-modal');
    const form = document.getElementById('wishlist-entry-form');
    if (!modal || !form) return;
    form.reset();
    setWishlistFormError('');
    state.wishlistEditingEntryId = entryId;
    state.wishlistSelectionMode = null;
    document.getElementById('btn-edit-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-wishlist-entry')?.setAttribute('aria-pressed', 'false');
    const entry = entryId ? state.wishlistEntries.find(item => item.id === entryId) : null;
    const boughtCheckbox = document.getElementById('wishlist-entry-bought');
    if (entry) {
        document.getElementById('wishlist-entry-title').value = entry.title || '';
        if (boughtCheckbox) boughtCheckbox.checked = isWishlistEntryBought(entry);
    } else {
        if (boughtCheckbox) boughtCheckbox.checked = (state.wishlistCurrentTab === 'bought');
    }
    document.getElementById('wishlist-entry-form-title').textContent = entry ? 'Chỉnh sửa Wishlist' : 'Thêm Wishlist';
    document.querySelector('#wishlist-entry-form button[type="submit"] span').textContent = entry ? 'Cập nhật' : 'Lưu';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    pushAppView('wishlist-entry-modal');
    document.getElementById('wishlist-entry-title')?.focus();
    createLucideIcons();
}

function closeWishlistEntryModal(returnToWishlist = true, fromHistory = false) {
    const modal = document.getElementById('wishlist-entry-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.wishlistEditingEntryId = null;
    renderWishlistEntries();
    if (returnToWishlist && !fromHistory) leaveAppView();
}

async function handleWishlistEntrySubmit(event) {
    event.preventDefault();
    if (!supabaseClient || !state.currentUserId) {
        showLoginScreen();
        return;
    }
    const title = document.getElementById('wishlist-entry-title')?.value.trim();
    const isBought = Boolean(document.getElementById('wishlist-entry-bought')?.checked);
    const submitButton = document.querySelector('#wishlist-entry-form button[type="submit"]');
    if (!title) return;
    const duplicateWishlist = state.wishlistEntries.some(entry =>
        entry.id !== state.wishlistEditingEntryId
        && normalizeDuplicateText(entry.title) === normalizeDuplicateText(title));
    if (duplicateWishlist) {
        setWishlistFormError('Wishlist này đã tồn tại. Vui lòng nhập tên khác.');
        return;
    }
    setWishlistFormError('');
    if (submitButton) submitButton.disabled = true;

    if (state.wishlistStorageMode === 'local') {
        saveWishlistEntryLocally(title, isBought);
        return;
    }

    const editingId = state.wishlistEditingEntryId;
    const maxOrder = state.wishlistEntries.reduce((max, entry) => Math.max(max, Number(entry.display_order) || 0), 0);
    const payload = editingId
        ? { title, is_bought: isBought, updated_at: new Date().toISOString() }
        : { user_id: state.currentUserId, title, display_order: maxOrder + 1, is_bought: isBought };

    let queryResult = await (editingId
        ? supabaseClient.from('wishlist_entries').update(payload).eq('id', editingId).eq('user_id', state.currentUserId)
        : supabaseClient.from('wishlist_entries').insert(payload)
    ).select('id,title,display_order,is_bought,created_at,updated_at').single();

    // Nếu bảng chưa có cột is_bought trong Supabase, retry lưu không kèm cột is_bought
    if (queryResult.error && (String(queryResult.error.message || '').includes('is_bought') || queryResult.error.code === '42703')) {
        const fallbackPayload = editingId
            ? { title, updated_at: new Date().toISOString() }
            : { user_id: state.currentUserId, title, display_order: maxOrder + 1 };
        const retryResult = await (editingId
            ? supabaseClient.from('wishlist_entries').update(fallbackPayload).eq('id', editingId).eq('user_id', state.currentUserId)
            : supabaseClient.from('wishlist_entries').insert(fallbackPayload)
        ).select('id,title,display_order,created_at,updated_at').single();

        if (!retryResult.error && retryResult.data) {
            queryResult = { data: { ...retryResult.data, is_bought: isBought }, error: null };
        }
    }

    const { data, error } = queryResult;
    if (submitButton) submitButton.disabled = false;
    if (error) {
        if (String(error.code || '') === '23505') {
            setWishlistFormError('Wishlist này đã tồn tại. Vui lòng nhập tên khác.');
            return;
        }
        if (isMissingWishlistTable(error)) {
            state.wishlistStorageMode = 'local';
            setWishlistNotice('Chưa có bảng wishlist_entries. Hãy chạy file SQL Wishlist để đồng bộ Supabase.');
            saveWishlistEntryLocally(title, isBought);
            if (submitButton) submitButton.disabled = false;
            closeWishlistEntryModal();
            return;
        }
        setWishlistFormError(`${error.code || 'SUPABASE'}: ${error.message || 'Không thể lưu Wishlist.'}`);
        return;
    }

    if (data && data.id) {
        const boughtMap = loadWishlistBoughtMap();
        if (isBought) boughtMap[data.id] = true;
        else delete boughtMap[data.id];
        saveWishlistBoughtMap(boughtMap);
        data.is_bought = isBought;
    }

    if (editingId) {
        state.wishlistEntries = state.wishlistEntries.map(entry => entry.id === editingId ? data : entry);
    } else {
        state.wishlistEntries.push(data);
    }

    if (isBought) state.wishlistCurrentTab = 'bought';
    else if (!editingId) state.wishlistCurrentTab = 'pending';

    renderWishlistEntries();
    closeWishlistEntryModal();
}

function saveWishlistEntryLocally(title, isBought = false) {
    const now = new Date().toISOString();
    const entries = loadLocalWishlistEntries();
    let entryId = state.wishlistEditingEntryId;

    if (state.wishlistEditingEntryId) {
        const index = entries.findIndex(entry => entry.id === state.wishlistEditingEntryId);
        if (index >= 0) {
            entries[index] = { ...entries[index], title, is_bought: isBought, updated_at: now };
        }
    } else {
        entryId = `local-${Date.now()}`;
        entries.push({
            id: entryId,
            title,
            display_order: entries.length + 1,
            is_bought: isBought,
            created_at: now,
            updated_at: now
        });
    }

    saveLocalWishlistEntries(entries);
    const boughtMap = loadWishlistBoughtMap();
    if (isBought) boughtMap[entryId] = true;
    else delete boughtMap[entryId];
    saveWishlistBoughtMap(boughtMap);

    state.wishlistEntries = entries;
    if (isBought) state.wishlistCurrentTab = 'bought';
    else if (!state.wishlistEditingEntryId) state.wishlistCurrentTab = 'pending';

    renderWishlistEntries();
    const submitButton = document.querySelector('#wishlist-entry-form button[type="submit"]');
    if (submitButton) submitButton.disabled = false;
    closeWishlistEntryModal();
}

// ============================================================================
// DANH SÁCH – chủ đề có các mục con, hiển thị dạng accordion
// ============================================================================

export default function start(user){
 state.currentUserId=user;supabaseClient=getClient();
    const btnOpenWishlist = document.getElementById('welcome-opt-wishlist');
    if (btnOpenWishlist) btnOpenWishlist.addEventListener('click', openWishlistModal);
    const btnCloseWishlist = document.getElementById('btn-close-wishlist-modal');
    if (btnCloseWishlist) btnCloseWishlist.addEventListener('click', closeWishlistModal);
    const btnAddWishlist = document.getElementById('btn-add-wishlist-entry');
    if (btnAddWishlist) btnAddWishlist.addEventListener('click', () => openWishlistEntryModal());
    const btnEditWishlist = document.getElementById('btn-edit-wishlist-entry');
    if (btnEditWishlist) btnEditWishlist.addEventListener('click', () => setWishlistSelectionMode('edit'));
    const btnDeleteWishlist = document.getElementById('btn-delete-wishlist-entry');
    if (btnDeleteWishlist) btnDeleteWishlist.addEventListener('click', () => setWishlistSelectionMode('delete'));
    const btnCloseWishlistEntry = document.getElementById('btn-close-wishlist-entry-modal');
    if (btnCloseWishlistEntry) btnCloseWishlistEntry.addEventListener('click', closeWishlistEntryModal);
    const btnCancelWishlistEntry = document.getElementById('btn-cancel-wishlist-entry');
    if (btnCancelWishlistEntry) btnCancelWishlistEntry.addEventListener('click', closeWishlistEntryModal);
    const wishlistEntryForm = document.getElementById('wishlist-entry-form');
    if (wishlistEntryForm) wishlistEntryForm.addEventListener('submit', handleWishlistEntrySubmit);
    const btnWishlistTabPending = document.getElementById('btn-wishlist-tab-pending');
    if (btnWishlistTabPending) btnWishlistTabPending.addEventListener('click', () => setWishlistTab('pending'));
    const btnWishlistTabBought = document.getElementById('btn-wishlist-tab-bought');
    if (btnWishlistTabBought) btnWishlistTabBought.addEventListener('click', () => setWishlistTab('bought'));


initNavigation('wishlist-modal',{'wishlist-entry-modal':()=>closeWishlistEntryModal(true,true)});
 openWishlistModal();
}
