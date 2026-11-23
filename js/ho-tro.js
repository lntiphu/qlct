import {initNavigation,pushAppView,leaveAppView} from './navigation.js';
import {createLucideIcons,normalizeSupportText,normalizeDuplicateText,goBackToHome as showLoginScreen} from './utils.js';
import {getClient} from './api.js';
const state = {
    supportEntries: [],
    supportStorageMode: 'supabase',
    supportSelectionMode: null,
    supportEditingEntryId: null,
    currentUserId: null
};
let supabaseClient;
function openSupportModal() {
    const modal = document.getElementById('support-modal');
    if (!modal) return;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    state.supportSelectionMode = null;
    document.getElementById('btn-edit-support-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-support-entry')?.setAttribute('aria-pressed', 'false');
    pushAppView('support-modal');
    fetchSupportEntries();
    createLucideIcons();
}

function closeSupportModal(returnToHub = true, fromHistory = false) {
    const modal = document.getElementById('support-modal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.supportSelectionMode = null;
    document.getElementById('btn-edit-support-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-support-entry')?.setAttribute('aria-pressed', 'false');
    if (returnToHub && !fromHistory) leaveAppView();
}

// Chuẩn hóa chuỗi để tìm kiếm không phân biệt dấu / hoa thường
// Ghi text vào ô, tự động nhận diện liên kết/sđt và tô sáng đoạn khớp từ khóa
function fillSupportCell(cell, text, query) {
    const source = String(text || '');
    if (!query) {
        const urlOrPhoneRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|0[35789]\d{8}\b)/gi;
        if (urlOrPhoneRegex.test(source)) {
            cell.replaceChildren();
            let lastIdx = 0;
            source.replace(urlOrPhoneRegex, (match, p1, offset) => {
                if (offset > lastIdx) {
                    cell.appendChild(document.createTextNode(source.slice(lastIdx, offset)));
                }
                if (/^0[35789]\d{8}$/.test(match)) {
                    const telLink = document.createElement('a');
                    telLink.href = `tel:${match}`;
                    telLink.className = 'support-tel-link';
                    telLink.textContent = `📞 ${match}`;
                    telLink.addEventListener('click', (e) => e.stopPropagation());
                    cell.appendChild(telLink);
                } else {
                    const webLink = document.createElement('a');
                    const fullHref = match.startsWith('http') ? match : `https://${match}`;
                    webLink.href = fullHref;
                    webLink.target = '_blank';
                    webLink.rel = 'noopener noreferrer';
                    webLink.className = 'support-web-link';
                    webLink.textContent = match;
                    webLink.addEventListener('click', (e) => e.stopPropagation());
                    cell.appendChild(webLink);
                }
                lastIdx = offset + match.length;
            });
            if (lastIdx < source.length) {
                cell.appendChild(document.createTextNode(source.slice(lastIdx)));
            }
            return;
        }

        cell.textContent = source;
        return;
    }
    // Chuẩn hóa từng ký tự riêng để map ngược đúng vị trí trong chuỗi gốc.
    const chars = Array.from(source);
    const normChars = chars.map(ch => normalizeSupportText(ch));
    const normJoined = normChars.join('');
    const starts = [];
    let pos = normJoined.indexOf(query);
    while (pos !== -1) {
        starts.push(pos);
        pos = normJoined.indexOf(query, pos + query.length);
    }
    if (!starts.length) {
        cell.textContent = source;
        return;
    }

    // Map vị trí trong chuỗi chuẩn hóa -> chỉ số ký tự gốc
    const offsetToChar = [];
    normChars.forEach((n, i) => { for (let k = 0; k < n.length; k++) offsetToChar.push(i); });

    let cursor = 0;
    starts.forEach(start => {
        const from = offsetToChar[start];
        const to = offsetToChar[start + query.length - 1] + 1;
        if (from < cursor) return;
        if (from > cursor) cell.appendChild(document.createTextNode(chars.slice(cursor, from).join('')));
        const mark = document.createElement('mark');
        mark.textContent = chars.slice(from, to).join('');
        cell.appendChild(mark);
        cursor = to;
    });
    if (cursor < chars.length) cell.appendChild(document.createTextNode(chars.slice(cursor).join('')));
}

function renderSupportEntries() {
    const tbody = document.getElementById('support-table-body');
    const countEl = document.getElementById('support-entry-count');
    if (!tbody) return;

    tbody.replaceChildren();
    const allEntries = state.supportEntries || [];
    const rawQuery = document.getElementById('support-search-input')?.value.trim() || '';
    const query = normalizeSupportText(rawQuery);
    const entries = query
        ? allEntries.filter(entry =>
            normalizeSupportText(entry.title).includes(query) ||
            normalizeSupportText(entry.content).includes(query))
        : allEntries;

    if (countEl) {
        countEl.textContent = query ? `${entries.length} / ${allEntries.length}` : String(allEntries.length);
    }

    if (!entries.length) {
        const row = document.createElement('tr');
        row.className = 'support-empty-row';
        const cell = document.createElement('td');
        cell.colSpan = 3;
        const isSearching = Boolean(query) && allEntries.length > 0;
        cell.innerHTML = `
            <div class="support-empty-state">
                <span class="support-empty-icon"><i data-lucide="${isSearching ? 'search-x' : 'life-buoy'}"></i></span>
                <strong>${isSearching ? 'Không tìm thấy kết quả' : 'Chưa có thông tin hỗ trợ'}</strong>
                <p>${isSearching ? 'Thử từ khóa khác nhé.' : 'Bấm nút “+ Thêm mới” ở góc trên để thêm thông tin tra cứu.'}</p>
            </div>`;
        row.appendChild(cell);
        tbody.appendChild(row);
        createLucideIcons();
        return;
    }

    entries.forEach((entry, index) => {
        const row = document.createElement('tr');

        const indexCell = document.createElement('td');
        indexCell.className = 'support-col-index';
        if (state.supportSelectionMode) {
            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'support-row-select';
            selectButton.title = state.supportSelectionMode === 'edit' ? 'Chỉnh sửa mục này' : 'Xóa mục này';
            selectButton.setAttribute('aria-label', selectButton.title);
            selectButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleSupportEntrySelection(entry.id);
            });
            indexCell.appendChild(selectButton);
        } else {
            const rowNumber = document.createElement('span');
            rowNumber.textContent = String(index + 1);
            indexCell.appendChild(rowNumber);
        }

        // Mỗi dòng: title = "Cần này", content = "Đi đây"
        const needCell = document.createElement('td');
        needCell.className = 'support-cell-need';
        needCell.dataset.label = 'Cần này';
        fillSupportCell(needCell, entry.title, query);

        const goCell = document.createElement('td');
        goCell.className = 'support-cell-go';
        goCell.dataset.label = 'Đi đây';
        fillSupportCell(goCell, entry.content, query);

        row.append(indexCell, needCell, goCell);

        row.title = state.supportSelectionMode 
            ? (state.supportSelectionMode === 'edit' ? 'Nhấn để chỉnh sửa' : 'Nhấn để xóa')
            : 'Nhấn để xem hoặc chỉnh sửa';

        row.addEventListener('click', (e) => {
            if (e.target.closest('a') || e.target.closest('button')) return;
            if (state.supportSelectionMode) {
                handleSupportEntrySelection(entry.id);
            } else {
                openSupportEntryModal(entry.id);
            }
        });

        tbody.appendChild(row);
    });

    createLucideIcons();
}

function setSupportSelectionMode(mode) {
    state.supportSelectionMode = state.supportSelectionMode === mode ? null : mode;
    const editButton = document.getElementById('btn-edit-support-entry');
    const deleteButton = document.getElementById('btn-delete-support-entry');
    if (editButton) editButton.setAttribute('aria-pressed', state.supportSelectionMode === 'edit' ? 'true' : 'false');
    if (deleteButton) deleteButton.setAttribute('aria-pressed', state.supportSelectionMode === 'delete' ? 'true' : 'false');
    renderSupportEntries();
}

function handleSupportEntrySelection(id) {
    if (!id || !state.supportSelectionMode) return;
    if (state.supportSelectionMode === 'edit') {
        openSupportEntryModal(id);
    } else {
        deleteSupportEntry(id);
    }
}

async function deleteSupportEntry(id) {
    if (!id) return;
    if (!confirm('Xóa dòng hỗ trợ này?')) return;

    if (state.supportStorageMode === 'local') {
        const entries = loadLocalSupportEntries().filter(entry => entry.id !== id);
        saveLocalSupportEntries(entries);
        state.supportEntries = entries;
        state.supportSelectionMode = null;
        renderSupportEntries();
        return;
    }

    if (!supabaseClient || !state.currentUserId) return;

    const { error } = await supabaseClient
        .from('support_entries')
        .delete()
        .eq('id', id)
        .eq('user_id', state.currentUserId);

    if (error) {
        console.error('Không thể xóa nội dung hỗ trợ:', error);
        alert('Không thể xóa thông tin hỗ trợ.');
        return;
    }

    state.supportEntries = state.supportEntries.filter(entry => entry.id !== id);
    state.supportSelectionMode = null;
    renderSupportEntries();
}

function isMissingSupportEntriesTable(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205'
        || code === '42P01'
        || message.includes("could not find the table 'public.support_entries'")
        || message.includes('relation "support_entries" does not exist');
}

function getSupportLocalStorageKey() {
    return state.currentUserId
        ? `qlct_support_entries_${state.currentUserId}`
        : 'qlct_support_entries';
}

function loadLocalSupportEntries() {
    try {
        const raw = localStorage.getItem(getSupportLocalStorageKey());
        const entries = raw ? JSON.parse(raw) : [];
        return Array.isArray(entries) ? entries : [];
    } catch (error) {
        console.warn('Không thể đọc dữ liệu hỗ trợ tạm:', error);
        return [];
    }
}

function saveLocalSupportEntries(entries) {
    localStorage.setItem(getSupportLocalStorageKey(), JSON.stringify(entries));
}

function setSupportStorageNotice(message = '') {
    const notice = document.getElementById('support-storage-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
}

function setSupportEntryFormError(message = '') {
    const errorEl = document.getElementById('support-entry-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
}

async function fetchSupportEntries() {
    if (!supabaseClient || !state.currentUserId) {
        state.supportStorageMode = 'local';
        state.supportEntries = loadLocalSupportEntries();
        setSupportStorageNotice('Chưa có phiên Supabase. Nội dung sẽ được lưu tạm trên thiết bị này.');
        renderSupportEntries();
        return;
    }

    const { data, error } = await supabaseClient
        .from('support_entries')
        .select('id,box_key,title,content,created_at,updated_at')
        .eq('user_id', state.currentUserId)
        .order('created_at', { ascending: false });

    if (error) {
        if (isMissingSupportEntriesTable(error)) {
            state.supportStorageMode = 'local';
            state.supportEntries = loadLocalSupportEntries();
            setSupportStorageNotice('Chưa có bảng support_entries. Nội dung mới sẽ được lưu tạm trên thiết bị; hãy chạy file supabase_support.sql để đồng bộ Supabase.');
        } else {
            console.error('Không thể tải nội dung hỗ trợ:', error);
            state.supportEntries = [];
            setSupportStorageNotice('Không thể tải hỗ trợ: ' + (error.message || 'Lỗi Supabase.'));
        }
    } else {
        state.supportStorageMode = 'supabase';
        state.supportEntries = data || [];
        setSupportStorageNotice('');
    }
    renderSupportEntries();
}

function openSupportEntryModal(entryId = null) {
    // Chặn event object lọt vào state khi hàm được gọi từ click handler cũ.
    if (entryId !== null && typeof entryId !== 'string') entryId = null;
    const modal = document.getElementById('support-entry-modal');
    const form = document.getElementById('support-entry-form');
    if (!modal || !form) return;

    form.reset();
    setSupportEntryFormError('');
    state.supportEditingEntryId = entryId;
    state.supportSelectionMode = null;

    const titleEl = document.getElementById('support-entry-form-title');
    const submitText = document.querySelector('#support-entry-form button[type="submit"] span');
    const editingEntry = entryId
        ? state.supportEntries.find(entry => entry.id === entryId)
        : null;
    if (editingEntry) {
        document.getElementById('support-entry-need').value = editingEntry.title || '';
        document.getElementById('support-entry-go').value = editingEntry.content || '';
    }
    if (titleEl) titleEl.textContent = editingEntry ? 'Chỉnh sửa' : 'Thêm mới';
    if (submitText) submitText.textContent = editingEntry ? 'Cập nhật' : 'Lưu';

    // Luôn mở form từ đầu. Không tự focus textarea ở đây: trên mobile,
    // autofocus sẽ bật bàn phím ngay khi bottom-sheet vừa xuất hiện,
    // làm visual viewport bị thu nhỏ và đẩy sheet lên sai vị trí.
    const formSheet = modal.querySelector('.support-entry-form-sheet');
    if (formSheet) formSheet.scrollTop = 0;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    pushAppView('support-entry-modal');
    createLucideIcons();
}

function closeSupportEntryModal(returnToSupport = true, fromHistory = false) {
    const modal = document.getElementById('support-entry-modal');
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.supportEditingEntryId = null;
    if (returnToSupport && !fromHistory) leaveAppView();
}

async function handleSupportEntrySubmit(event) {
    event.preventDefault();

    if (!supabaseClient || !state.currentUserId) {
        showLoginScreen();
        return;
    }

    const need = document.getElementById('support-entry-need')?.value.trim();
    const go = document.getElementById('support-entry-go')?.value.trim();
    const submitButton = document.querySelector('#support-entry-form button[type="submit"]');

    if (!need || !go) return;
    const duplicateSupportEntry = state.supportEntries.some(entry =>
        entry.id !== state.supportEditingEntryId
        && normalizeDuplicateText(entry.title) === normalizeDuplicateText(need)
        && normalizeDuplicateText(entry.content) === normalizeDuplicateText(go));
    if (duplicateSupportEntry) {
        setSupportEntryFormError('Thông tin này đã tồn tại. Vui lòng nhập nội dung khác.');
        return;
    }
    setSupportEntryFormError('');
    if (submitButton) submitButton.disabled = true;

    if (state.supportStorageMode === 'local') {
        const now = new Date().toISOString();
        const editingId = state.supportEditingEntryId;
        const localEntries = loadLocalSupportEntries();
        if (editingId) {
            const entryIndex = localEntries.findIndex(entry => entry.id === editingId);
            if (entryIndex >= 0) {
                localEntries[entryIndex] = {
                    ...localEntries[entryIndex],
                    title: need,
                    content: go,
                    updated_at: now
                };
            }
        } else {
            localEntries.unshift({
                id: `local-${Date.now()}`,
                box_key: 'can_nay',
                title: need,
                content: go,
                created_at: now,
                updated_at: now
            });
        }
        saveLocalSupportEntries(localEntries);
        state.supportEntries = localEntries;
        renderSupportEntries();
        if (submitButton) submitButton.disabled = false;
        closeSupportEntryModal();
        return;
    }

    const editingId = state.supportEditingEntryId;
    const supportQuery = editingId
        ? supabaseClient
            .from('support_entries')
            .update({ title: need, content: go, updated_at: new Date().toISOString() })
            .eq('id', editingId)
            .eq('user_id', state.currentUserId)
        : supabaseClient
            .from('support_entries')
            .insert({
                user_id: state.currentUserId,
                box_key: 'can_nay',
                title: need,
                content: go
            });

    const { data, error } = await supportQuery
        .select('id,box_key,title,content,created_at,updated_at')
        .single();

    if (submitButton) submitButton.disabled = false;

    if (error) {
        if (String(error.code || '') === '23505') {
            setSupportEntryFormError('Thông tin này đã tồn tại. Vui lòng nhập nội dung khác.');
            return;
        }
        if (isMissingSupportEntriesTable(error)) {
            state.supportStorageMode = 'local';
            const now = new Date().toISOString();
            const localEntries = loadLocalSupportEntries();
            const fallbackIndex = state.supportEditingEntryId
                ? localEntries.findIndex(entry => entry.id === state.supportEditingEntryId)
                : -1;
            if (fallbackIndex >= 0) {
                localEntries[fallbackIndex] = {
                    ...localEntries[fallbackIndex],
                    title: need,
                    content: go,
                    updated_at: now
                };
            } else {
                localEntries.unshift({
                    id: `local-${Date.now()}`,
                    box_key: 'can_nay',
                    title: need,
                    content: go,
                    created_at: now,
                    updated_at: now
                });
            }
            saveLocalSupportEntries(localEntries);
            state.supportEntries = localEntries;
            renderSupportEntries();
            setSupportStorageNotice('Bảng support_entries chưa được tạo. Đã lưu tạm trên thiết bị; hãy chạy file supabase_support.sql để đồng bộ Supabase.');
            closeSupportEntryModal();
        } else {
            console.error('Không thể lưu nội dung hỗ trợ:', error);
            setSupportEntryFormError(`${error.code || 'SUPABASE'}: ${error.message || 'Không thể lưu thông tin hỗ trợ.'}`);
        }
        return;
    }

    if (editingId) {
        state.supportEntries = state.supportEntries.map(entry => entry.id === editingId ? data : entry);
    } else {
        state.supportEntries.unshift(data);
    }
    renderSupportEntries();
    closeSupportEntryModal();
}

// ============================================================================
// WISHLIST – danh sách mong muốn có thể kéo để đổi thứ tự TOP & Tab Đã mua
// ============================================================================

export default function start(user){
 state.currentUserId=user;supabaseClient=getClient();
    const btnOpenSupport = document.getElementById('welcome-opt-hotro');
    if (btnOpenSupport) {
        btnOpenSupport.addEventListener('click', openSupportModal);
    }
    const btnCloseSupport = document.getElementById('btn-close-support-modal');
    if (btnCloseSupport) {
        btnCloseSupport.addEventListener('click', closeSupportModal);
    }
    // Tìm kiếm trong trang Hỗ trợ
    const supportSearchInput = document.getElementById('support-search-input');
    const btnClearSupportSearch = document.getElementById('btn-clear-support-search');
    if (supportSearchInput) {
        supportSearchInput.addEventListener('input', () => {
            if (btnClearSupportSearch) btnClearSupportSearch.hidden = !supportSearchInput.value;
            renderSupportEntries();
        });
    }
    if (btnClearSupportSearch && supportSearchInput) {
        btnClearSupportSearch.addEventListener('click', event => {
            event.preventDefault();
            supportSearchInput.value = '';
            btnClearSupportSearch.hidden = true;
            renderSupportEntries();
            supportSearchInput.focus();
        });
    }
    const btnAddSupportEntry = document.getElementById('btn-add-support-entry');
    if (btnAddSupportEntry) {
        // Không truyền PointerEvent vào hàm mở form; nếu không event sẽ bị dùng
        // nhầm làm id và Supabase báo lỗi UUID "[object PointerEvent]" khi lưu.
        btnAddSupportEntry.addEventListener('click', () => openSupportEntryModal());
    }
    const btnEditSupportEntry = document.getElementById('btn-edit-support-entry');
    if (btnEditSupportEntry) {
        btnEditSupportEntry.addEventListener('click', () => setSupportSelectionMode('edit'));
    }
    const btnDeleteSupportEntry = document.getElementById('btn-delete-support-entry');
    if (btnDeleteSupportEntry) {
        btnDeleteSupportEntry.addEventListener('click', () => setSupportSelectionMode('delete'));
    }
    const btnCloseSupportEntry = document.getElementById('btn-close-support-entry-modal');
    if (btnCloseSupportEntry) {
        btnCloseSupportEntry.addEventListener('click', closeSupportEntryModal);
    }
    const btnCancelSupportEntry = document.getElementById('btn-cancel-support-entry');
    if (btnCancelSupportEntry) {
        btnCancelSupportEntry.addEventListener('click', closeSupportEntryModal);
    }
    const supportEntryModal = document.getElementById('support-entry-modal');
    if (supportEntryModal) {
        supportEntryModal.addEventListener('click', event => {
            if (event.target.id === 'support-entry-modal') closeSupportEntryModal();
        });
    }
    const supportEntryForm = document.getElementById('support-entry-form');
    if (supportEntryForm) {
        supportEntryForm.addEventListener('submit', handleSupportEntrySubmit);
    }


initNavigation('support-modal',{'support-entry-modal':()=>closeSupportEntryModal(true,true)});
 openSupportModal();
}
