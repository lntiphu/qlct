import {onReady, createLucideIcons} from './utils.js';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
import {initNavigation,pushAppView,leaveAppView} from './navigation.js';
/**
 * Sổ tay (tính năng thứ 10)
 * Lưu chính trên Supabase, có localStorage làm cache dự phòng.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'qlct_handbook_entries_v1';
    const CUSTOM_CAT_KEY = 'qlct_handbook_custom_categories_v1';
    const DEFAULT_CATEGORIES = ['Ho/cảm cúm', 'Tiêu hóa', 'Da liễu', 'Xương khớp', 'Mẹo vặt gia đình', 'Khác'];
    let customCategories = [];
    let entries = [];
    let currentDetailId = null;
    let editingId = null;
    let handbookClient = null;
    let currentUserId = null;
    let storageMode = 'local';
    let loadedUserKey = null;
    let loadingPromise = null;

    function loadCustomCategories() {
        try {
            const raw = localStorage.getItem(CUSTOM_CAT_KEY);
            customCategories = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(customCategories)) customCategories = [];
        } catch {
            customCategories = [];
        }
    }

    function saveCustomCategories() {
        try {
            localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(customCategories));
        } catch (e) {
            console.warn('[Sổ tay sức khỏe] Không thể lưu danh mục tùy ý:', e);
        }
    }

    function getAllCategories() {
        const set = new Set([...DEFAULT_CATEGORIES, ...customCategories]);
        entries.forEach(e => {
            if (e.category && typeof e.category === 'string') {
                const trimmed = e.category.trim();
                if (trimmed) set.add(trimmed);
            }
        });
        return Array.from(set);
    }

    function populateCategorySelect(selectedCategory = '') {
        const select = document.getElementById('handbook-entry-category');
        if (!select) return;
        const allCats = getAllCategories();
        select.innerHTML = allCats.map(cat => 
            `<option value="${escapeHtml(cat)}"${cat === selectedCategory ? ' selected' : ''}>${escapeHtml(cat)}</option>`
        ).join('') + `<option value="__custom__">➕ Thêm danh mục mới...</option>`;

        if (selectedCategory && allCats.includes(selectedCategory)) {
            select.value = selectedCategory;
        } else if (allCats.length) {
            select.value = allCats[0];
        }
    }

    // Ba bài mẫu để người dùng có thể xem thử ngay lần đầu.
    const SAMPLE_ENTRIES = [
        {
            title: 'Nước gừng ấm giảm ho',
            category: 'Ho/cảm cúm',
            use: 'Làm ấm cổ họng, hỗ trợ giảm cảm giác khó chịu khi ho nhẹ hoặc nhiễm lạnh.',
            ingredients: 'Gừng tươi, nước ấm, một ít mật ong nếu phù hợp.',
            method: 'Rửa sạch và thái vài lát gừng. Hãm với nước nóng khoảng 5–10 phút. Đợi nước bớt nóng rồi mới thêm mật ong và uống từng ngụm nhỏ.',
            warning: 'Không dùng mật ong cho trẻ dưới 1 tuổi. Không tự điều trị nếu khó thở, sốt cao hoặc triệu chứng kéo dài.',
            source: 'Kinh nghiệm gia đình',
            personal: 'Uống ấm vào buổi tối, theo dõi phản ứng của cơ thể.',
            favorite: true
        },
        {
            title: 'Nước chanh muối hỗ trợ tiêu hóa',
            category: 'Tiêu hóa',
            use: 'Bổ sung nước và tạo cảm giác dễ chịu sau khi vận động hoặc ăn uống khó tiêu nhẹ.',
            ingredients: 'Nước ấm, vài giọt chanh, một nhúm muối nhỏ.',
            method: 'Pha loãng chanh và muối trong một cốc nước ấm. Uống chậm, không uống khi bụng đang kích ứng.',
            warning: 'Người đau dạ dày, trào ngược hoặc cần hạn chế muối nên hỏi ý kiến bác sĩ trước khi dùng.',
            source: 'Sổ tay gia đình',
            personal: 'Pha loãng, không dùng thay nước uống hằng ngày.',
            favorite: false
        },
        {
            title: 'Chườm ấm khi mỏi cơ nhẹ',
            category: 'Xương khớp',
            use: 'Hỗ trợ thư giãn vùng cơ bị căng mỏi sau khi làm việc hoặc vận động nhẹ.',
            ingredients: 'Khăn sạch và nước ấm vừa phải.',
            method: 'Nhúng khăn vào nước ấm, vắt ráo rồi chườm lên vùng mỏi 10–15 phút. Có thể kết hợp nghỉ ngơi và vận động nhẹ.',
            warning: 'Không chườm lên vùng sưng nóng, vết thương hở hoặc khi nghi ngờ chấn thương nặng.',
            source: 'Kinh nghiệm chăm sóc tại nhà',
            personal: 'Dừng ngay nếu thấy đau tăng hoặc da bị bỏng rát.',
            favorite: false
        }
    ];

    function createId() {
        return `handbook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Chuẩn hóa để tìm kiếm tiếng Việt không phân biệt dấu.
    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                timeZone: 'Asia/Ho_Chi_Minh'
            }).format(new Date(value));
        } catch {
            return '';
        }
    }

    function getLocalStorageKey() {
        return currentUserId ? `${STORAGE_KEY}_${currentUserId}` : STORAGE_KEY;
    }

    function saveEntriesLocally() {
        try {
            localStorage.setItem(getLocalStorageKey(), JSON.stringify(entries));
        } catch (error) {
            console.warn('[Sổ tay] Không thể lưu cache localStorage:', error);
        }
    }

    function loadEntriesLocally() {
        const saved = localStorage.getItem(getLocalStorageKey());
        if (saved === null) {
            entries = SAMPLE_ENTRIES.map(item => ({
                ...item,
                id: createId(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }));
            saveEntriesLocally();
            return;
        }
        try {
            const parsed = JSON.parse(saved);
            entries = Array.isArray(parsed) ? parsed : [];
        } catch {
            entries = [];
        }
    }

    function initSupabase() {
        if (typeof supabase === 'undefined' || !supabase.createClient) return;
        try {
            handbookClient = window.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true },
                realtime: { timeout: 5000 }
            });
            window.__QLCT_SUPABASE_CLIENT = handbookClient;
        } catch (error) {
            console.warn('[Sổ tay] Không thể khởi tạo Supabase:', error);
        }
    }

    // Đổi tên cột Supabase về tên dùng trong giao diện.
    function rowToEntry(row) {
        const rawCat = String(row.category || '').trim();
        return {
            id: row.id,
            title: String(row.title || '').normalize('NFC'),
            category: rawCat || 'Khác',
            use: String(row.benefits || '').normalize('NFC'),
            ingredients: String(row.ingredients || '').normalize('NFC'),
            method: String(row.method || '').normalize('NFC'),
            warning: String(row.warnings || '').normalize('NFC'),
            source: String(row.source || '').normalize('NFC'),
            personal: String(row.personal_note || '').normalize('NFC'),
            favorite: Boolean(row.is_favorite),
            createdAt: row.created_at || new Date().toISOString(),
            updatedAt: row.updated_at || new Date().toISOString()
        };
    }

    function entryToRow(entry) {
        return {
            id: entry.id,
            user_id: currentUserId,
            title: entry.title,
            category: entry.category,
            benefits: entry.use || '',
            ingredients: entry.ingredients || '',
            method: entry.method || '',
            warnings: entry.warning || '',
            source: entry.source || '',
            personal_note: entry.personal || '',
            is_favorite: Boolean(entry.favorite),
            created_at: entry.createdAt || new Date().toISOString(),
            updated_at: entry.updatedAt || new Date().toISOString()
        };
    }

    async function syncEntryToSupabase(entry) {
        if (!handbookClient || !currentUserId) return;
        const { error } = await handbookClient.from('handbook_entries').upsert([entryToRow(entry)], { onConflict: 'user_id,id' });
        if (error) {
            console.warn('[Sổ tay] Lỗi lưu Supabase:', error.message);
            updateStorageStatus('Lỗi đồng bộ, đang giữ bản local', 'error');
        } else {
            updateStorageStatus('Đã lưu trên Supabase', 'remote');
        }
    }

    async function deleteEntryFromSupabase(id) {
        if (!handbookClient || !currentUserId) return;
        const { error } = await handbookClient.from('handbook_entries').delete().eq('user_id', currentUserId).eq('id', id);
        if (error) {
            console.warn('[Sổ tay] Lỗi xóa trên Supabase:', error.message);
            updateStorageStatus('Lỗi đồng bộ, đang giữ bản local', 'error');
        }
    }

    async function seedRemoteSamples() {
        const sampleEntries = SAMPLE_ENTRIES.map(item => ({
            ...item,
            id: createId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));
        const { error } = await handbookClient.from('handbook_entries').upsert(sampleEntries.map(entryToRow), { onConflict: 'user_id,id' });
        if (error) throw error;
        localStorage.setItem(`${STORAGE_KEY}_seeded_${currentUserId}`, '1');
        return sampleEntries;
    }

    async function loadEntries() {
        if (loadingPromise) return loadingPromise;
        loadingPromise = (async () => {
            if (handbookClient) {
                try {
                    const { data: sessionData } = await handbookClient.auth.getSession();
                    currentUserId = sessionData?.session?.user?.id || null;
                } catch (error) {
                    console.warn('[Sổ tay] Không đọc được phiên đăng nhập:', error);
                }
            }

            const userKey = currentUserId || 'local';
            if (loadedUserKey === userKey) return;

            if (handbookClient && currentUserId) {
                const { data, error } = await handbookClient
                    .from('handbook_entries')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .order('updated_at', { ascending: false });

                if (!error) {
                    storageMode = 'supabase';
                    if (Array.isArray(data) && data.length) {
                        entries = data.map(rowToEntry);
                    } else if (!localStorage.getItem(`${STORAGE_KEY}_seeded_${currentUserId}`)) {
                        try {
                            entries = await seedRemoteSamples();
                        } catch (seedError) {
                            storageMode = 'local';
                            console.warn('[Sổ tay] Không thể tạo bài mẫu trên Supabase:', seedError.message);
                            loadEntriesLocally();
                        }
                    } else {
                        entries = [];
                    }
                    saveEntriesLocally();
                    updateStorageStatus(storageMode === 'supabase' ? 'Đã đồng bộ Supabase' : 'Đang dùng bản local', storageMode === 'supabase' ? 'remote' : 'local');
                } else {
                    storageMode = 'local';
                    console.warn('[Sổ tay] Không tải được bảng handbook_entries:', error.message);
                    loadEntriesLocally();
                    updateStorageStatus('Chưa kết nối được Supabase · đang dùng bản local', 'error');
                }
            } else {
                storageMode = 'local';
                loadEntriesLocally();
                updateStorageStatus('Chưa đăng nhập · đang lưu trên thiết bị', 'local');
            }

            loadedUserKey = userKey;
            renderEntries();
        })().finally(() => {
            loadingPromise = null;
        });
        return loadingPromise;
    }

    function getFilteredEntries() {
        const query = normalize(document.getElementById('handbook-search-input')?.value);
        const favBtn = document.getElementById('btn-toggle-handbook-fav');
        const onlyFavorite = Boolean(favBtn && favBtn.classList.contains('is-active'));

        return entries
            .filter(entry => !onlyFavorite || Boolean(entry.favorite))
            .filter(entry => {
                if (!query) return true;
                return [entry.title, entry.use, entry.ingredients, entry.category, entry.method, entry.warning]
                    .some(field => normalize(field).includes(query));
            })
            .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }

    function renderEntries() {
        const container = document.getElementById('handbook-cards-container');
        if (!container) return;

        const filtered = getFilteredEntries();
        const query = normalize(document.getElementById('handbook-search-input')?.value);
        const favBtn = document.getElementById('btn-toggle-handbook-fav');
        const isFavFilter = Boolean(favBtn && favBtn.classList.contains('is-active'));

        if (!filtered.length) {
            let emptyTitle = 'Chưa có bài viết nào';
            let emptyMsg = 'Bấm “+ Thêm bài” để lưu các mẹo hay và bài thuốc gia đình.';
            if (query) {
                emptyTitle = 'Không tìm thấy bài phù hợp';
                emptyMsg = `Không có kết quả nào khớp với từ khóa “${escapeHtml(query)}”.`;
            } else if (isFavFilter) {
                emptyTitle = 'Chưa có bài viết yêu thích';
                emptyMsg = 'Bấm vào biểu tượng ngôi sao trên bài viết để ghim vào danh sách yêu thích!';
            }
            container.innerHTML = `
                <div class="handbook-empty-state">
                    <div class="handbook-empty-icon-wrap"><i data-lucide="book-open"></i></div>
                    <h3>${emptyTitle}</h3>
                    <p>${emptyMsg}</p>
                </div>
            `;
            refreshIcons();
            return;
        }

        container.innerHTML = filtered.map((entry, index) => {
            const excerpt = entry.use || entry.ingredients || entry.method || 'Chưa có mô tả ngắn.';
            const cleanTitle = String(entry.title || '').normalize('NFC');
            const cleanExcerpt = String(excerpt).normalize('NFC');
            const starSvg = entry.favorite
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#F59E0B" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
            return `
                <article class="handbook-card ${entry.favorite ? 'is-favorite' : ''}" data-handbook-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="Mở bài ${escapeHtml(cleanTitle)}">
                    <div class="handbook-card-compact-row">
                        <h3 class="handbook-card-title">${escapeHtml(cleanTitle)}</h3>
                        <div class="handbook-card-actions">
                            <button type="button" class="handbook-star-btn ${entry.favorite ? 'is-active' : ''}" data-action="favorite" data-id="${escapeHtml(entry.id)}" aria-label="${entry.favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}" title="${entry.favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích'}">
                                ${starSvg}
                            </button>
                            <button type="button" class="handbook-card-quick-btn quick-edit" data-action="quick-edit" data-id="${escapeHtml(entry.id)}" title="Sửa bài" aria-label="Sửa bài">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button type="button" class="handbook-card-quick-btn quick-del" data-action="quick-delete" data-id="${escapeHtml(entry.id)}" title="Xóa bài" aria-label="Xóa bài">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        container.querySelectorAll('[data-action="favorite"]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                toggleFavorite(button.dataset.id);
            });
        });
        container.querySelectorAll('[data-action="quick-edit"]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                openEntryModal(button.dataset.id);
            });
        });
        container.querySelectorAll('[data-action="quick-delete"]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                deleteEntry(button.dataset.id);
            });
        });
        container.querySelectorAll('.handbook-card').forEach(card => {
            const open = (e) => {
                if (e && e.target.closest('button')) return;
                openDetail(card.dataset.handbookId);
            };
            card.addEventListener('click', open);
            card.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDetail(card.dataset.handbookId);
                }
            });
        });
        refreshIcons();
    }

    function refreshIcons() {
        try {
            if (typeof createLucideIcons === 'function') createLucideIcons();
            else if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        } catch (e) {
            console.warn('[Sổ tay] refreshIcons:', e);
        }
    }

    function updateStorageStatus(message, type = 'remote') {
        const status = document.getElementById('handbook-sync-status');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-local', type === 'local');
        status.classList.toggle('is-error', type === 'error');
    }

    function setModalState(id, active) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.toggle('active', active);
        modal.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    function openHandbookModal() {
        void loadEntries();
        renderEntries();
        setModalState('handbook-modal', true);
        if (typeof pushAppView === 'function') pushAppView('handbook-modal');
        refreshIcons();
    }

    function closeHandbookModal(returnToHub = true, fromHistory = false) {
        closeEntryModal(true);
        closeDetail(true);
        setModalState('handbook-modal', false);
        if (returnToHub && fromHistory !== true && typeof leaveAppView === 'function') leaveAppView();
    }

    function renderDetailContent(entry) {
        if (!entry) return;
        const category = document.getElementById('handbook-detail-category');
        const title = document.getElementById('handbook-detail-title');
        const body = document.getElementById('handbook-detail-body');
        if (category) {
            category.innerHTML = entry.favorite 
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="#D97706" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>${escapeHtml(entry.category)}`
                : escapeHtml(entry.category);
        }
        if (title) title.textContent = String(entry.title || '').normalize('NFC');
        if (body) {
            const fields = [
                ['Công dụng', entry.use, 'sec-use', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`],
                ['Nguyên liệu', entry.ingredients, 'sec-ingredients', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`],
                ['Cách làm / cách dùng', entry.method, 'sec-method', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>`],
                ['Lưu ý / chống chỉ định', entry.warning, 'sec-warning', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`],
                ['Nguồn', entry.source, 'sec-source', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`],
                ['Ghi chú cá nhân', entry.personal, 'sec-personal', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>`]
            ];
            const filledSections = fields.filter(([label, value]) => Boolean(value && String(value).trim()));
            if (!filledSections.length) {
                body.innerHTML = `
                    <section class="handbook-detail-section">
                        <p style="color:#94A3B8;font-style:italic;margin:0;">Chưa có nội dung chi tiết cho bài viết này.</p>
                    </section>
                `;
            } else {
                body.innerHTML = filledSections.map(([label, value, secClass, svgIcon]) => `
                    <section class="handbook-detail-section ${secClass}">
                        <h3>${svgIcon}<span>${label}</span></h3>
                        <p>${escapeHtml(String(value).normalize('NFC'))}</p>
                    </section>
                `).join('');
            }
        }
        refreshIcons();
    }

    function openDetail(id, pushHistory = true) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        currentDetailId = id;
        renderDetailContent(entry);
        setModalState('handbook-detail-modal', true);
        const scrollArea = document.getElementById('handbook-detail-page-scroll');
        if (scrollArea) scrollArea.scrollTop = 0;
        if (pushHistory && typeof pushAppView === 'function') pushAppView('handbook-detail-modal');
    }

    function closeDetail(fromHistory = false) {
        if (!currentDetailId) return;
        currentDetailId = null;
        setModalState('handbook-detail-modal', false);
        if (fromHistory !== true && typeof leaveAppView === 'function') leaveAppView();
    }

    function valueOf(id) {
        return (document.getElementById(id)?.value.trim() || '').normalize('NFC');
    }

    function fillEntryForm(entry) {
        populateCategorySelect(entry?.category || DEFAULT_CATEGORIES[0]);
        const customBox = document.getElementById('handbook-custom-cat-box');
        if (customBox) customBox.setAttribute('hidden', '');
        const customInput = document.getElementById('handbook-entry-custom-category');
        if (customInput) customInput.value = '';

        const values = {
            'handbook-entry-id': entry?.id || '',
            'handbook-entry-title': String(entry?.title || '').normalize('NFC'),
            'handbook-entry-use': String(entry?.use || '').normalize('NFC'),
            'handbook-entry-ingredients': String(entry?.ingredients || '').normalize('NFC'),
            'handbook-entry-method': String(entry?.method || '').normalize('NFC'),
            'handbook-entry-warning': String(entry?.warning || '').normalize('NFC'),
            'handbook-entry-source': String(entry?.source || '').normalize('NFC'),
            'handbook-entry-personal': String(entry?.personal || '').normalize('NFC')
        };
        Object.entries(values).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        });
    }

    function setupCustomCategoryEvents() {
        const select = document.getElementById('handbook-entry-category');
        const customBox = document.getElementById('handbook-custom-cat-box');
        const customInput = document.getElementById('handbook-entry-custom-category');
        const btnToggle = document.getElementById('btn-toggle-custom-cat');
        const btnConfirm = document.getElementById('btn-confirm-custom-cat');

        if (btnToggle && customBox) {
            btnToggle.onclick = () => {
                const isHidden = customBox.hasAttribute('hidden');
                if (isHidden) {
                    customBox.removeAttribute('hidden');
                    customInput?.focus();
                } else {
                    customBox.setAttribute('hidden', '');
                }
            };
        }

        if (select && customBox) {
            select.onchange = () => {
                if (select.value === '__custom__') {
                    customBox.removeAttribute('hidden');
                    customInput?.focus();
                } else {
                    customBox.setAttribute('hidden', '');
                }
            };
        }

        const applyCustom = () => {
            const val = (customInput?.value || '').trim();
            if (!val) return;
            if (!customCategories.includes(val) && !DEFAULT_CATEGORIES.includes(val)) {
                customCategories.push(val);
                saveCustomCategories();
            }
            populateCategorySelect(val);
            if (customInput) customInput.value = '';
            customBox?.setAttribute('hidden', '');
        };

        if (btnConfirm) btnConfirm.onclick = applyCustom;
        if (customInput) {
            customInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyCustom();
                }
            };
        }
    }

    function openEntryModal(id = null) {
        editingId = id;
        const entry = id ? entries.find(item => item.id === id) : null;
        fillEntryForm(entry);
        setupCustomCategoryEvents();
        const title = document.getElementById('handbook-entry-form-title');
        const saveText = document.getElementById('handbook-save-text');
        if (title) title.textContent = entry ? 'Chỉnh sửa bài' : 'Thêm bài mới';
        if (saveText) saveText.textContent = entry ? 'Cập nhật bài' : 'Lưu bài';
        document.getElementById('handbook-form-error')?.setAttribute('hidden', '');
        document.getElementById('handbook-modal')?.classList.add('is-subpage-hidden');
        document.getElementById('handbook-detail-modal')?.classList.add('is-subpage-hidden');
        setModalState('handbook-entry-modal', true);
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (typeof pushAppView === 'function') pushAppView('handbook-entry-modal');
        refreshIcons();
        setTimeout(() => document.getElementById('handbook-entry-title')?.focus(), 120);
    }

    function closeEntryModal(fromHistory = false) {
        editingId = null;
        setModalState('handbook-entry-modal', false);
        document.getElementById('handbook-modal')?.classList.remove('is-subpage-hidden');
        document.getElementById('handbook-detail-modal')?.classList.remove('is-subpage-hidden');
        document.getElementById('handbook-entry-form')?.reset();
        document.getElementById('handbook-custom-cat-box')?.setAttribute('hidden', '');
        if (fromHistory !== true && typeof leaveAppView === 'function') leaveAppView();
    }

    function showFormError(message) {
        const error = document.getElementById('handbook-form-error');
        if (!error) return;
        error.textContent = message;
        error.removeAttribute('hidden');
    }

    function handleSubmit(event) {
        event.preventDefault();
        const title = valueOf('handbook-entry-title');
        let category = valueOf('handbook-entry-category');
        const customCatVal = valueOf('handbook-entry-custom-category');

        if (category === '__custom__' || customCatVal) {
            if (customCatVal) {
                category = customCatVal;
                if (!customCategories.includes(category) && !DEFAULT_CATEGORIES.includes(category)) {
                    customCategories.push(category);
                    saveCustomCategories();
                }
            } else {
                showFormError('Vui lòng nhập tên danh mục mới của bạn.');
                document.getElementById('handbook-entry-custom-category')?.focus();
                return;
            }
        }

        if (!title || !category) {
            showFormError('Vui lòng nhập Tên bài và chọn Danh mục.');
            return;
        }

        const old = editingId ? entries.find(item => item.id === editingId) : null;
        const item = {
            id: old?.id || createId(),
            title,
            category,
            use: valueOf('handbook-entry-use'),
            ingredients: valueOf('handbook-entry-ingredients'),
            method: valueOf('handbook-entry-method'),
            warning: valueOf('handbook-entry-warning'),
            source: valueOf('handbook-entry-source'),
            personal: valueOf('handbook-entry-personal'),
            favorite: Boolean(old?.favorite),
            createdAt: old?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const wasViewingDetail = Boolean(currentDetailId && currentDetailId === item.id);

        if (old) entries = entries.map(entry => entry.id === old.id ? item : entry);
        else entries.unshift(item);
        saveEntriesLocally();
        void syncEntryToSupabase(item);
        renderEntries();

        if (wasViewingDetail) {
            renderDetailContent(item);
            setModalState('handbook-detail-modal', true);
            closeEntryModal();
        } else {
            closeEntryModal(true);
            openDetail(item.id, false);
            if (typeof history !== 'undefined' && history.replaceState) {
                history.replaceState({
                    ...(history.state || {}),
                    qlctAppView: 'handbook-detail-modal',
                    qlctAppDepth: history.state?.qlctAppDepth || 0
                }, '', window.location.href);
            }
        }
    }

    function toggleFavorite(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        entry.favorite = !Boolean(entry.favorite);
        entry.updatedAt = new Date().toISOString();
        saveEntriesLocally();
        void syncEntryToSupabase(entry);
        renderEntries();
        if (currentDetailId === id) renderDetailContent(entry);
    }

    function deleteEntry(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        if (!window.confirm(`Bạn có chắc muốn xóa bài “${entry.title}” không?`)) return;
        entries = entries.filter(item => item.id !== id);
        saveEntriesLocally();
        void deleteEntryFromSupabase(id);
        closeDetail();
        renderEntries();
    }

    function printEntry(id) {
        const entry = entries.find(item => item.id === id);
        if (!entry) return;
        const printable = window.open('', '_blank', 'width=820,height=900');
        if (!printable) return;
        const sections = [
            ['Danh mục', entry.category], ['Công dụng', entry.use], ['Nguyên liệu', entry.ingredients],
            ['Cách làm / cách dùng', entry.method], ['Lưu ý / chống chỉ định', entry.warning],
            ['Nguồn', entry.source], ['Ghi chú cá nhân', entry.personal]
        ];
        printable.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(entry.title)}</title><style>body{font-family:Arial,sans-serif;color:#243126;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6}h1{color:#276b3b}h2{font-size:16px;color:#276b3b;border-bottom:1px solid #d9e5da;padding-bottom:4px;margin-top:22px}p{white-space:pre-wrap;margin:6px 0}small{color:#68766b}@media print{body{margin:0}}</style></head><body><small>SỔ TAY SỨC KHỎE · ${escapeHtml(entry.category)}</small><h1>${escapeHtml(entry.title)}</h1>${sections.filter(([, v]) => Boolean(v && v.trim())).map(([label, value]) => `<h2>${label}</h2><p>${escapeHtml(value)}</p>`).join('')}<small>Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.</small></body></html>`);
        printable.document.close();
        printable.focus();
        setTimeout(() => printable.print(), 250);
    }

    function bindEvents() {
        loadCustomCategories();
        // Dùng chung phiên đăng nhập và Supabase client của ứng dụng chính.
        initSupabase();
        if (handbookClient) {
            handbookClient.auth.onAuthStateChange((event, session) => {
                const nextUserId = session?.user?.id || null;
                if (nextUserId === currentUserId) return;
                currentUserId = nextUserId;
                loadedUserKey = null;
                void loadEntries();
            });
        }
        void loadEntries();

        document.getElementById('welcome-opt-handbook')?.addEventListener('click', openHandbookModal);
        document.getElementById('btn-close-handbook-modal')?.addEventListener('click', () => closeHandbookModal());
        document.getElementById('btn-add-handbook-entry')?.addEventListener('click', () => openEntryModal());
        document.getElementById('btn-toggle-handbook-fav')?.addEventListener('click', () => {
            const btn = document.getElementById('btn-toggle-handbook-fav');
            if (btn) {
                btn.classList.toggle('is-active');
                renderEntries();
            }
        });
        document.getElementById('btn-close-handbook-detail')?.addEventListener('click', () => closeDetail());
        document.getElementById('btn-edit-handbook-detail')?.addEventListener('click', () => {
            if (currentDetailId) openEntryModal(currentDetailId);
        });
        document.getElementById('btn-delete-handbook-detail')?.addEventListener('click', () => {
            if (currentDetailId) deleteEntry(currentDetailId);
        });
        document.getElementById('btn-print-handbook-detail')?.addEventListener('click', () => {
            if (currentDetailId) printEntry(currentDetailId);
        });
        document.getElementById('btn-close-handbook-entry')?.addEventListener('click', () => closeEntryModal());
        document.getElementById('btn-cancel-handbook-entry')?.addEventListener('click', () => closeEntryModal());
        document.getElementById('handbook-entry-form')?.addEventListener('submit', handleSubmit);
        document.getElementById('handbook-search-input')?.addEventListener('input', event => {
            const clear = document.getElementById('btn-clear-handbook-search');
            if (clear) clear.hidden = !event.target.value;
            renderEntries();
        });
        document.getElementById('btn-clear-handbook-search')?.addEventListener('click', () => {
            const input = document.getElementById('handbook-search-input');
            if (input) input.value = '';
            document.getElementById('btn-clear-handbook-search').hidden = true;
            renderEntries();
            input?.focus();
        });
        document.getElementById('handbook-entry-modal')?.addEventListener('click', event => {
            if (event.target.id === 'handbook-entry-modal') closeEntryModal();
        });
    }

    window.openHandbookModal = openHandbookModal;
    window.closeHandbookModal = closeHandbookModal;
    window.closeHandbookDetail = closeDetail;
    window.closeHandbookEntryModal = closeEntryModal;

    if (document.readyState === 'loading') onReady(bindEvents);
    else bindEvents();
})();

export default function start(){
initNavigation('handbook-modal',{'handbook-entry-modal':()=>window.closeHandbookEntryModal(true),'handbook-detail-modal':()=>window.closeHandbookDetail(true)});
 window.openHandbookModal();
}
