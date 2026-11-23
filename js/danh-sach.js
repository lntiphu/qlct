import {initNavigation,pushAppView,leaveAppView} from './navigation.js';
import {createLucideIcons,normalizeSupportText,normalizeDuplicateText,goBackToHome as showLoginScreen} from './utils.js';
import {getClient} from './api.js';
const state = {
    listEntries: [],
    listSelectionMode: null,
    listEditingEntryId: null,
    listEditingTopicKey: null,
    listEntryFormType: 'item',
    listStorageMode: 'supabase',
    listExpandedTopics: new Set(),
    currentUserId: null
};
let supabaseClient;
function openListModal() {
    const modal = document.getElementById('list-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('data-selection-mode');
    state.listSelectionMode = null;
    setListActionButtons();
    pushAppView('list-modal');
    fetchListEntries();
    createLucideIcons();
}

function closeListModal(returnToHub = true, fromHistory = false) {
    const modal = document.getElementById('list-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute('data-selection-mode');
    state.listSelectionMode = null;
    setListActionButtons();
    if (returnToHub && !fromHistory) leaveAppView();
}

function isMissingListTable(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205'
        || code === '42P01'
        || message.includes("could not find the table 'public.list_entries'")
        || message.includes('relation "list_entries" does not exist');
}

function getListLocalStorageKey() {
    return state.currentUserId ? `qlct_list_${state.currentUserId}` : 'qlct_list';
}

function loadLocalListEntries() {
    try {
        const raw = localStorage.getItem(getListLocalStorageKey());
        const entries = raw ? JSON.parse(raw) : [];
        return Array.isArray(entries) ? entries : [];
    } catch (error) {
        console.warn('Không thể đọc Danh sách tạm:', error);
        return [];
    }
}

function saveLocalListEntries(entries) {
    localStorage.setItem(getListLocalStorageKey(), JSON.stringify(entries));
}

function getListDoneKey() {
    return state.currentUserId ? `qlct_list_done_${state.currentUserId}` : 'qlct_list_done';
}

function loadListDoneMap() {
    try {
        const raw = localStorage.getItem(getListDoneKey());
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveListDoneMap(map) {
    try {
        localStorage.setItem(getListDoneKey(), JSON.stringify(map));
    } catch (e) {
        console.warn('Không thể lưu trạng thái hoàn thành:', e);
    }
}

function isEntryDone(entry) {
    if (!entry) return false;
    if (entry.is_done !== undefined && entry.is_done !== null) return Boolean(entry.is_done);
    const doneMap = loadListDoneMap();
    return Boolean(doneMap[entry.id]);
}

function sortListEntries(entries) {
    return [...entries].sort((a, b) => {
        const topicOrder = (Number(a.topic_order) || 0) - (Number(b.topic_order) || 0);
        if (topicOrder !== 0) return topicOrder;
        const itemOrder = (Number(a.item_order) || 0) - (Number(b.item_order) || 0);
        if (itemOrder !== 0) return itemOrder;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
}

function getListTopicGroups(entries = state.listEntries) {
    const groups = new Map();
    sortListEntries(entries).forEach(entry => {
        const topic = String(entry.topic || '').trim();
        if (!topic) return;
        if (!groups.has(topic)) {
            groups.set(topic, {
                topic,
                topic_order: Number(entry.topic_order) || groups.size + 1,
                entries: []
            });
        }
        groups.get(topic).entries.push(entry);
    });
    return [...groups.values()].sort((a, b) => a.topic_order - b.topic_order);
}

function setListNotice(message = '') {
    const notice = document.getElementById('list-storage-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
}

function setListFormError(message = '') {
    const errorEl = document.getElementById('list-entry-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
}

function setListActionButtons() {
    const editButton = document.getElementById('btn-edit-list-entry');
    const deleteButton = document.getElementById('btn-delete-list-entry');
    if (editButton) editButton.setAttribute('aria-pressed', state.listSelectionMode === 'edit' ? 'true' : 'false');
    if (deleteButton) deleteButton.setAttribute('aria-pressed', state.listSelectionMode === 'delete' ? 'true' : 'false');
}

function renderListEntries() {
    const container = document.getElementById('list-topics-list');
    const countEl = document.getElementById('list-topic-count');
    if (!container) return;

    container.replaceChildren();
    const groups = getListTopicGroups();
    if (countEl) countEl.textContent = groups.length;

    if (!groups.length) {
        const empty = document.createElement('div');
        empty.className = 'list-empty-state';
        empty.innerHTML = '<span class="list-empty-icon"><i data-lucide="layers-3"></i></span><strong>Chưa có chủ đề</strong><p>Bấm nút “+ Thêm mới” để tạo chủ đề và thêm các mục con.</p>';
        container.appendChild(empty);
        createLucideIcons();
        return;
    }

    groups.forEach(group => {
        const topicCard = document.createElement('section');
        topicCard.className = 'list-topic-card';

        const header = document.createElement('div');
        header.className = 'list-topic-header';

        if (state.listSelectionMode) {
            const selectTopicButton = document.createElement('button');
            selectTopicButton.type = 'button';
            selectTopicButton.className = `support-row-select list-row-select ${state.listSelectionMode === 'delete' ? 'is-delete' : 'is-edit'}`;
            selectTopicButton.title = state.listSelectionMode === 'edit'
                ? 'Chỉnh sửa chủ đề này'
                : 'Xóa chủ đề và các mục con';
            selectTopicButton.setAttribute('aria-label', selectTopicButton.title);
            selectTopicButton.innerHTML = state.listSelectionMode === 'edit'
                ? '<i data-lucide="pencil"></i>'
                : '<i data-lucide="trash-2"></i>';
            selectTopicButton.addEventListener('click', (e) => {
                e.stopPropagation();
                handleListTopicSelection(group.topic);
            });
            header.appendChild(selectTopicButton);
        }

        const doneCount = group.entries.filter(e => isEntryDone(e)).length;
        const totalCount = group.entries.length;
        const countText = doneCount > 0 ? `${doneCount}/${totalCount}` : `${totalCount}`;
        const countClass = (doneCount === totalCount && totalCount > 0)
            ? 'is-all-done'
            : (doneCount > 0 ? 'has-done' : '');

        const topicToggle = document.createElement('button');
        topicToggle.type = 'button';
        topicToggle.className = 'list-topic-toggle';
        const expanded = state.listExpandedTopics.has(group.topic);
        topicToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        topicToggle.innerHTML = `<i class="list-topic-chevron" data-lucide="chevron-down"></i><span class="list-topic-name"></span><span class="list-topic-count ${countClass}">${countText}</span>`;
        topicToggle.querySelector('.list-topic-name').textContent = group.topic;
        topicToggle.addEventListener('click', () => {
            if (state.listSelectionMode === 'edit') {
                handleListTopicSelection(group.topic);
                return;
            }
            if (state.listSelectionMode === 'delete') {
                handleListTopicSelection(group.topic);
                return;
            }
            if (state.listExpandedTopics.has(group.topic)) state.listExpandedTopics.delete(group.topic);
            else state.listExpandedTopics.add(group.topic);
            renderListEntries();
        });
        header.appendChild(topicToggle);
        topicCard.appendChild(header);

        const items = document.createElement('div');
        items.className = 'list-topic-items';
        items.hidden = !expanded;
        group.entries.forEach((entry, index) => {
            const itemRow = document.createElement('div');
            itemRow.className = 'list-item-row';
            const isDone = isEntryDone(entry);
            if (isDone) itemRow.classList.add('is-done');

            if (state.listSelectionMode) {
                const selectItemButton = document.createElement('button');
                selectItemButton.type = 'button';
                selectItemButton.className = `support-row-select list-row-select ${state.listSelectionMode === 'delete' ? 'is-delete' : 'is-edit'}`;
                selectItemButton.title = state.listSelectionMode === 'edit'
                    ? 'Chỉnh sửa mục này'
                    : 'Xóa mục này';
                selectItemButton.setAttribute('aria-label', selectItemButton.title);
                selectItemButton.innerHTML = state.listSelectionMode === 'edit'
                    ? '<i data-lucide="pencil"></i>'
                    : '<i data-lucide="trash-2"></i>';
                selectItemButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleListItemSelection(entry.id);
                });
                itemRow.appendChild(selectItemButton);
            } else {
                const itemNumber = document.createElement('span');
                itemNumber.className = 'list-item-number';
                itemNumber.textContent = String(index + 1);
                itemRow.appendChild(itemNumber);
            }
            const itemText = document.createElement('span');
            itemText.className = 'list-item-name';
            itemText.textContent = entry.item || '';
            itemRow.appendChild(itemText);

            // Dấu tích Đã xem / Đã đi tinh tế ở bên phải
            if (!state.listSelectionMode) {
                const checkButton = document.createElement('button');
                checkButton.type = 'button';
                checkButton.className = `list-item-check-btn ${isDone ? 'is-checked' : ''}`;
                checkButton.setAttribute('aria-label', isDone ? 'Đánh dấu chưa đi / chưa xem' : 'Đánh dấu đã đi / đã xem');
                checkButton.title = isDone ? 'Đã xem / Đã đi (Bấm để bỏ đánh dấu)' : 'Đánh dấu đã xem / Đã đi';
                checkButton.innerHTML = '<i data-lucide="check"></i>';
                checkButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleListItemDone(entry.id, e);
                });
                itemRow.appendChild(checkButton);
            }

            itemRow.addEventListener('click', (e) => {
                if (e.target.closest('.list-item-check-btn')) return;
                if (state.listSelectionMode === 'edit') {
                    handleListItemSelection(entry.id);
                } else if (state.listSelectionMode === 'delete') {
                    handleListItemSelection(entry.id);
                }
                // Ở chế độ bình thường (không bấm nút sửa chữa): tắt hoàn toàn tính năng mở sửa chữa
            });

            items.appendChild(itemRow);
        });
        topicCard.appendChild(items);
        container.appendChild(topicCard);
    });

    createLucideIcons();
}

function setListSelectionMode(mode) {
    state.listSelectionMode = state.listSelectionMode === mode ? null : mode;
    const modal = document.getElementById('list-modal');
    if (modal) {
        if (state.listSelectionMode) modal.setAttribute('data-selection-mode', state.listSelectionMode);
        else modal.removeAttribute('data-selection-mode');
    }
    setListActionButtons();
    renderListEntries();
}

function handleListTopicSelection(topic) {
    if (!topic || !state.listSelectionMode) return;
    if (state.listSelectionMode === 'edit') openListEntryModal({ topicKey: topic });
    else deleteListTopic(topic);
}

function handleListItemSelection(id) {
    if (!id || !state.listSelectionMode) return;
    if (state.listSelectionMode === 'edit') openListEntryModal({ entryId: id });
    else deleteListItem(id);
}

function getListTopicNames() {
    return getListTopicGroups().map(group => group.topic);
}

function populateListTopicSelect(selectedTopic = '') {
    const select = document.getElementById('list-entry-topic-select');
    if (!select) return;
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Chọn chủ đề có sẵn';
    select.appendChild(placeholder);
    getListTopicNames().forEach(topic => {
        const option = document.createElement('option');
        option.value = topic;
        option.textContent = topic;
        select.appendChild(option);
    });
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '＋ Tạo chủ đề mới';
    select.appendChild(newOption);
    select.value = selectedTopic || '';
}

function toggleListNewTopicField(show) {
    const field = document.getElementById('list-new-topic-field');
    const input = document.getElementById('list-entry-new-topic');
    if (field) field.hidden = !show;
    if (input) input.required = Boolean(show);
}

function handleListTopicChoiceChange(event) {
    if (state.listEntryFormType === 'topic') return;
    toggleListNewTopicField(event.target.value === '__new__');
}

function openListEntryModal({ entryId = null, topicKey = null } = {}) {
    const modal = document.getElementById('list-entry-modal');
    const form = document.getElementById('list-entry-form');
    if (!modal || !form) return;
    form.reset();
    setListFormError('');
    state.listEditingEntryId = entryId;
    state.listEditingTopicKey = topicKey;
    state.listEntryFormType = topicKey ? 'topic' : 'item';
    state.listSelectionMode = null;
    setListActionButtons();

    const topicChoiceField = document.querySelector('.list-topic-choice-field');
    const topicChoiceRow = document.querySelector('.list-topic-choice-row');
    const newTopicField = document.getElementById('list-new-topic-field');
    const itemField = document.getElementById('list-item-field');
    const newTopicInput = document.getElementById('list-entry-new-topic');
    const itemInput = document.getElementById('list-entry-item');
    const title = document.getElementById('list-entry-form-title');
    const description = document.getElementById('list-entry-form-description');

    if (topicKey) {
        if (topicChoiceField) topicChoiceField.hidden = false;
        if (topicChoiceRow) topicChoiceRow.hidden = true;
        const topicSelect = document.getElementById('list-entry-topic-select');
        if (topicSelect) topicSelect.required = false;
        if (newTopicField) newTopicField.hidden = false;
        if (newTopicInput) { newTopicInput.value = topicKey; newTopicInput.required = true; }
        if (itemField) itemField.hidden = true;
        if (itemInput) itemInput.required = false;
        if (title) title.textContent = 'Sửa chủ đề';
        if (description) description.textContent = 'Đổi tên chủ đề và giữ nguyên các mục con.';
    } else {
        if (topicChoiceField) topicChoiceField.hidden = false;
        if (topicChoiceRow) topicChoiceRow.hidden = false;
        const topicSelect = document.getElementById('list-entry-topic-select');
        if (topicSelect) topicSelect.required = true;
        if (newTopicField) newTopicField.hidden = true;
        if (newTopicInput) { newTopicInput.value = ''; newTopicInput.required = false; }
        if (itemField) itemField.hidden = false;
        if (itemInput) itemInput.required = true;
        const entry = entryId ? state.listEntries.find(item => item.id === entryId) : null;
        populateListTopicSelect(entry?.topic || '');
        if (itemInput) itemInput.value = entry?.item || '';
        if (title) title.textContent = entry ? 'Sửa mục con' : 'Thêm mục con';
        if (description) description.textContent = 'Chọn chủ đề có sẵn hoặc tạo chủ đề mới.';
        toggleListNewTopicField(false);
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    pushAppView('list-entry-modal');
    (topicKey ? newTopicInput : itemInput)?.focus();
    createLucideIcons();
}

function closeListEntryModal(returnToList = true, fromHistory = false) {
    const modal = document.getElementById('list-entry-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    state.listEditingEntryId = null;
    state.listEditingTopicKey = null;
    state.listEntryFormType = 'item';
    renderListEntries();
    if (returnToList && !fromHistory) leaveAppView();
}

function getListFormTopic() {
    const select = document.getElementById('list-entry-topic-select');
    const newTopic = document.getElementById('list-entry-new-topic');
    return select?.value === '__new__' ? (newTopic?.value || '').trim() : (select?.value || '').trim();
}

function nextListTopicOrder(entries = state.listEntries) {
    return entries.reduce((max, entry) => Math.max(max, Number(entry.topic_order) || 0), 0) + 1;
}

function nextListItemOrder(topic, entries = state.listEntries) {
    return entries.filter(entry => entry.topic === topic)
        .reduce((max, entry) => Math.max(max, Number(entry.item_order) || 0), 0) + 1;
}

async function handleListEntrySubmit(event) {
    event.preventDefault();
    if (!supabaseClient || !state.currentUserId) {
        showLoginScreen();
        return;
    }
    const submitButton = document.querySelector('#list-entry-form button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setListFormError('');

    if (state.listEntryFormType === 'topic') {
        const oldTopic = state.listEditingTopicKey;
        const newTopic = document.getElementById('list-entry-new-topic')?.value.trim();
        if (!newTopic) {
            setListFormError('Vui lòng nhập tên chủ đề.');
            if (submitButton) submitButton.disabled = false;
            return;
        }
        if (normalizeDuplicateText(newTopic) !== normalizeDuplicateText(oldTopic)
            && getListTopicNames().some(topic => normalizeDuplicateText(topic) === normalizeDuplicateText(newTopic))) {
            setListFormError('Chủ đề này đã tồn tại.');
            if (submitButton) submitButton.disabled = false;
            return;
        }
        if (state.listStorageMode === 'local') {
            state.listEntries = state.listEntries.map(entry => entry.topic === oldTopic ? { ...entry, topic: newTopic } : entry);
            saveLocalListEntries(state.listEntries);
            state.listExpandedTopics.delete(oldTopic);
            state.listExpandedTopics.add(newTopic);
            if (submitButton) submitButton.disabled = false;
            renderListEntries();
            closeListEntryModal();
            return;
        }
        const { error } = await supabaseClient.from('list_entries')
            .update({ topic: newTopic, updated_at: new Date().toISOString() })
            .eq('topic', oldTopic)
            .eq('user_id', state.currentUserId);
        if (error) {
            setListFormError(`${error.code || 'SUPABASE'}: ${error.message || 'Không thể cập nhật chủ đề.'}`);
            if (submitButton) submitButton.disabled = false;
            return;
        }
        state.listEntries = state.listEntries.map(entry => entry.topic === oldTopic ? { ...entry, topic: newTopic } : entry);
        state.listExpandedTopics.delete(oldTopic);
        state.listExpandedTopics.add(newTopic);
        if (submitButton) submitButton.disabled = false;
        renderListEntries();
        closeListEntryModal();
        return;
    }

    let topic = getListFormTopic();
    const item = document.getElementById('list-entry-item')?.value.trim();
    if (!topic || !item) {
        setListFormError('Vui lòng chọn hoặc tạo chủ đề, sau đó nhập mục con.');
        if (submitButton) submitButton.disabled = false;
        return;
    }

    const editingId = state.listEditingEntryId;
    const editingEntry = editingId ? state.listEntries.find(entry => entry.id === editingId) : null;
    const matchingTopic = getListTopicNames().find(name => normalizeDuplicateText(name) === normalizeDuplicateText(topic));
    const creatingTopic = document.getElementById('list-entry-topic-select')?.value === '__new__';
    if (creatingTopic && matchingTopic) {
        setListFormError(`Chủ đề “${matchingTopic}” đã tồn tại. Hãy chọn chủ đề đó hoặc đặt tên khác.`);
        if (submitButton) submitButton.disabled = false;
        return;
    }
    if (matchingTopic) topic = matchingTopic;
    const duplicateListItem = state.listEntries.some(entry =>
        entry.id !== editingId
        && normalizeDuplicateText(entry.item) === normalizeDuplicateText(item));
    if (duplicateListItem) {
        setListFormError(`Mục con “${item}” đã tồn tại trong Danh sách.`);
        if (submitButton) submitButton.disabled = false;
        return;
    }
    if (state.listStorageMode === 'local') {
        saveListItemLocally(topic, item);
        return;
    }

    const targetTopicOrder = editingEntry && editingEntry.topic === topic
        ? editingEntry.topic_order
        : (getListTopicGroups().find(group => group.topic === topic)?.topic_order || nextListTopicOrder());
    const targetItemOrder = editingEntry && editingEntry.topic === topic
        ? editingEntry.item_order
        : nextListItemOrder(topic);
    const query = editingId
        ? supabaseClient.from('list_entries').update({ topic, item, topic_order: targetTopicOrder, item_order: targetItemOrder, updated_at: new Date().toISOString() }).eq('id', editingId).eq('user_id', state.currentUserId)
        : supabaseClient.from('list_entries').insert({ user_id: state.currentUserId, topic, item, topic_order: targetTopicOrder, item_order: targetItemOrder });
    const { data, error } = await query.select('id,topic,item,topic_order,item_order,created_at,updated_at').single();
    if (error) {
        if (String(error.code || '') === '23505') {
            setListFormError('Mục con này đã tồn tại trong Danh sách.');
            if (submitButton) submitButton.disabled = false;
            return;
        }
        if (isMissingListTable(error)) {
            state.listStorageMode = 'local';
            setListNotice('Chưa có bảng list_entries. Đã chuyển sang lưu tạm trên thiết bị; hãy chạy file supabase_list.sql.');
            saveListItemLocally(topic, item);
            if (submitButton) submitButton.disabled = false;
            return;
        }
        setListFormError(`${error.code || 'SUPABASE'}: ${error.message || 'Không thể lưu mục.'}`);
        if (submitButton) submitButton.disabled = false;
        return;
    }
    if (editingId) state.listEntries = state.listEntries.map(entry => entry.id === editingId ? data : entry);
    else state.listEntries.push(data);
    state.listEntries = sortListEntries(state.listEntries);
    state.listExpandedTopics.add(topic);
    if (submitButton) submitButton.disabled = false;
    renderListEntries();
    closeListEntryModal();
}

function saveListItemLocally(topic, item) {
    const now = new Date().toISOString();
    const entries = loadLocalListEntries();
    const editingId = state.listEditingEntryId;
    const current = editingId ? entries.find(entry => entry.id === editingId) : null;
    const next = current
        ? entries.map(entry => entry.id === editingId ? { ...entry, topic, item, item_order: entry.topic === topic ? entry.item_order : nextListItemOrder(topic, entries), updated_at: now } : entry)
        : [...entries, { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, topic, item, topic_order: getListTopicGroups(entries).find(group => group.topic === topic)?.topic_order || nextListTopicOrder(entries), item_order: nextListItemOrder(topic, entries), created_at: now, updated_at: now }];
    state.listEntries = sortListEntries(next);
    saveLocalListEntries(state.listEntries);
    state.listExpandedTopics.add(topic);
    const submitButton = document.querySelector('#list-entry-form button[type="submit"]');
    if (submitButton) submitButton.disabled = false;
    renderListEntries();
    closeListEntryModal();
}

async function toggleListItemDone(id, event) {
    if (event) event.stopPropagation();
    const entry = state.listEntries.find(item => item.id === id);
    if (!entry) return;

    const nextDone = !isEntryDone(entry);
    entry.is_done = nextDone;

    const doneMap = loadListDoneMap();
    if (nextDone) doneMap[id] = true;
    else delete doneMap[id];
    saveListDoneMap(doneMap);

    saveLocalListEntries(state.listEntries);

    if (nextDone) {
        const group = getListTopicGroups().find(g => g.topic === entry.topic);
        if (group && group.entries.length > 0 && group.entries.every(e => isEntryDone(e))) {
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 45,
                    spread: 60,
                    origin: { y: 0.7 }
                });
            }
        }
    }

    renderListEntries();

    if (supabaseClient && state.currentUserId && state.listStorageMode !== 'local') {
        try {
            const { error } = await supabaseClient
                .from('list_entries')
                .update({ is_done: nextDone, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', state.currentUserId);
            if (error) {
                console.warn('Lưu Supabase is_done không thành công (đã lưu trên thiết bị):', error.message);
            }
        } catch (err) {
            console.warn('Lỗi kết nối Supabase:', err);
        }
    }
}

async function deleteListItem(id) {
    const entry = state.listEntries.find(item => item.id === id);
    if (!entry || !confirm(`Bạn có chắc muốn xóa mục “${entry.item}” không?`)) return;
    if (state.listStorageMode === 'local') {
        state.listEntries = state.listEntries.filter(item => item.id !== id);
        saveLocalListEntries(state.listEntries);
    } else {
        const { error } = await supabaseClient.from('list_entries').delete().eq('id', id).eq('user_id', state.currentUserId);
        if (error) { alert('Không thể xóa mục. Vui lòng thử lại.'); return; }
        state.listEntries = state.listEntries.filter(item => item.id !== id);
    }
    const doneMap = loadListDoneMap();
    if (doneMap[id]) {
        delete doneMap[id];
        saveListDoneMap(doneMap);
    }
    state.listSelectionMode = null;
    setListActionButtons();
    renderListEntries();
    persistListOrders();
}

async function deleteListTopic(topic) {
    const group = getListTopicGroups().find(item => item.topic === topic);
    if (!group || !confirm(`Xóa chủ đề “${topic}” và toàn bộ ${group.entries.length} mục con?`)) return;
    if (state.listStorageMode === 'local') {
        state.listEntries = state.listEntries.filter(entry => entry.topic !== topic);
        saveLocalListEntries(state.listEntries);
    } else {
        const { error } = await supabaseClient.from('list_entries').delete().eq('topic', topic).eq('user_id', state.currentUserId);
        if (error) { alert('Không thể xóa chủ đề. Vui lòng thử lại.'); return; }
        state.listEntries = state.listEntries.filter(entry => entry.topic !== topic);
    }
    state.listExpandedTopics.delete(topic);
    state.listSelectionMode = null;
    setListActionButtons();
    renderListEntries();
    persistListOrders();
}

async function persistListOrders() {
    const groups = getListTopicGroups();
    groups.forEach((group, topicIndex) => {
        group.entries.forEach((entry, itemIndex) => {
            entry.topic_order = topicIndex + 1;
            entry.item_order = itemIndex + 1;
        });
    });
    state.listEntries = sortListEntries(state.listEntries);
    if (state.listStorageMode === 'local') {
        saveLocalListEntries(state.listEntries);
        return;
    }
    if (!supabaseClient || !state.currentUserId) return;
    await Promise.all(state.listEntries.map(entry => supabaseClient.from('list_entries').update({ topic_order: entry.topic_order, item_order: entry.item_order }).eq('id', entry.id).eq('user_id', state.currentUserId)));
}

async function fetchListEntries() {
    const doneMap = loadListDoneMap();
    if (!supabaseClient || !state.currentUserId) {
        state.listStorageMode = 'local';
        state.listEntries = sortListEntries(loadLocalListEntries()).map(entry => ({
            ...entry,
            is_done: entry.is_done !== undefined ? Boolean(entry.is_done) : Boolean(doneMap[entry.id])
        }));
        setListNotice('Chưa có phiên Supabase. Danh sách sẽ được lưu tạm trên thiết bị này.');
        renderListEntries();
        return;
    }
    let queryResult = await supabaseClient.from('list_entries')
        .select('id,topic,item,topic_order,item_order,is_done,created_at,updated_at')
        .eq('user_id', state.currentUserId)
        .order('topic_order', { ascending: true })
        .order('item_order', { ascending: true });

    if (queryResult.error && (String(queryResult.error.message || '').includes('is_done') || queryResult.error.code === '42703')) {
        queryResult = await supabaseClient.from('list_entries')
            .select('id,topic,item,topic_order,item_order,created_at,updated_at')
            .eq('user_id', state.currentUserId)
            .order('topic_order', { ascending: true })
            .order('item_order', { ascending: true });
    }

    const { data, error } = queryResult;
    if (error) {
        if (isMissingListTable(error)) {
            state.listStorageMode = 'local';
            state.listEntries = sortListEntries(loadLocalListEntries()).map(entry => ({
                ...entry,
                is_done: entry.is_done !== undefined ? Boolean(entry.is_done) : Boolean(doneMap[entry.id])
            }));
            setListNotice('Chưa có bảng list_entries. Hãy chạy file supabase_list.sql để đồng bộ Supabase.');
        } else {
            console.error('Không thể tải Danh sách:', error);
            state.listEntries = [];
            setListNotice(error.message || 'Không thể tải Danh sách.');
        }
    } else {
        state.listStorageMode = 'supabase';
        state.listEntries = sortListEntries((data || []).map(entry => ({
            ...entry,
            is_done: entry.is_done !== undefined ? Boolean(entry.is_done) : Boolean(doneMap[entry.id])
        })));
        setListNotice('');
    }
    renderListEntries();
}

// ============================================================================
// QUOTES (TRÍCH DẪN) – tính năng thứ 9 (BẢNG SHOW ĐƯỢC THIẾT KẾ ĐẸP MẮT)
// ============================================================================

export default function start(user){
 state.currentUserId=user;supabaseClient=getClient();
    const btnOpenList = document.getElementById('welcome-opt-list');
    if (btnOpenList) btnOpenList.addEventListener('click', openListModal);
    const btnCloseList = document.getElementById('btn-close-list-modal');
    if (btnCloseList) btnCloseList.addEventListener('click', closeListModal);
    const btnAddList = document.getElementById('btn-add-list-entry');
    if (btnAddList) btnAddList.addEventListener('click', () => openListEntryModal());
    const btnEditList = document.getElementById('btn-edit-list-entry');
    if (btnEditList) btnEditList.addEventListener('click', () => setListSelectionMode('edit'));
    const btnDeleteList = document.getElementById('btn-delete-list-entry');
    if (btnDeleteList) btnDeleteList.addEventListener('click', () => setListSelectionMode('delete'));
    const btnCloseListEntry = document.getElementById('btn-close-list-entry-modal');
    if (btnCloseListEntry) btnCloseListEntry.addEventListener('click', closeListEntryModal);
    const btnCancelListEntry = document.getElementById('btn-cancel-list-entry');
    if (btnCancelListEntry) btnCancelListEntry.addEventListener('click', closeListEntryModal);
    const listEntryForm = document.getElementById('list-entry-form');
    if (listEntryForm) listEntryForm.addEventListener('submit', handleListEntrySubmit);
    const listTopicSelect = document.getElementById('list-entry-topic-select');
    if (listTopicSelect) listTopicSelect.addEventListener('change', handleListTopicChoiceChange);
    const btnCreateListTopic = document.getElementById('btn-create-list-topic');
    if (btnCreateListTopic) btnCreateListTopic.addEventListener('click', () => {
        const select = document.getElementById('list-entry-topic-select');
        if (select) select.value = '__new__';
        toggleListNewTopicField(true);
        document.getElementById('list-entry-new-topic')?.focus();
    });


initNavigation('list-modal',{'list-entry-modal':()=>closeListEntryModal(true,true)});
 openListModal();
}
