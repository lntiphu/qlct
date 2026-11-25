import {initNavigation,pushAppView,leaveAppView} from './navigation.js';
import {createLucideIcons,normalizeSupportText,normalizeDuplicateText,goBackToHome as showLoginScreen} from './utils.js';
import {getClient} from './api.js';
const state = {
    quoteEntries: [],
    quoteSelectionMode: null,
    quoteEditingEntryId: null,
    quoteStorageMode: 'supabase',
    quoteSearchQuery: '',
    quoteCurrentFilter: 'all',
    quoteHeroIndex: 0,
    currentUserId: null
};
let supabaseClient;
const SAMPLE_QUOTES = [
    { quote: "Cách duy nhất để làm nên sự nghiệp vĩ đại là yêu lấy việc bạn đang làm.", author: "Steve Jobs" },
    { quote: "Hành trình vạn dặm luôn bắt đầu từ một bước chân nhỏ bé.", author: "Lão Tử" },
    { quote: "Giữa những khó khăn luôn ẩn chứa cơ hội tuyệt vời.", author: "Albert Einstein" },
    { quote: "Điều quan trọng nhất không phải là bạn đứng ở đâu, mà là bạn đang đi về hướng nào.", author: "Oliver Wendell Holmes" },
    { quote: "Đừng sợ thất bại. Hãy sợ việc bạn vẫn giậm chân tại chỗ vào năm sau.", author: "Khuyết danh" }
];

function openQuoteModal() {
    const modal = document.getElementById('quote-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('data-selection-mode');
    state.quoteSelectionMode = null;
    document.getElementById('btn-edit-quote-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-quote-entry')?.setAttribute('aria-pressed', 'false');
    pushAppView('quote-modal');
    fetchQuoteEntries();
    createLucideIcons();
}

function closeQuoteModal(returnToHub = true, fromHistory = false) {
    const modal = document.getElementById('quote-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute('data-selection-mode');
    state.quoteSelectionMode = null;
    document.getElementById('btn-edit-quote-entry')?.setAttribute('aria-pressed', 'false');
    document.getElementById('btn-delete-quote-entry')?.setAttribute('aria-pressed', 'false');
    if (returnToHub && !fromHistory) leaveAppView();
}

function isMissingQuoteTable(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205'
        || code === '42P01'
        || message.includes("could not find the table 'public.quote_entries'")
        || message.includes('relation "quote_entries" does not exist');
}

function getQuoteLocalStorageKey() {
    return state.currentUserId ? `qlct_quotes_${state.currentUserId}` : 'qlct_quotes';
}

function loadLocalQuoteEntries() {
    try {
        const raw = localStorage.getItem(getQuoteLocalStorageKey());
        const entries = raw ? JSON.parse(raw) : [];
        return (Array.isArray(entries) ? entries : []).map(entry => ({
            ...entry,
            quote: String(entry?.quote || '').normalize('NFC'),
            author: String(entry?.author || 'Khuyết danh').normalize('NFC')
        }));
    } catch (error) {
        console.warn('Không thể đọc Quote tạm:', error);
        return [];
    }
}

function saveLocalQuoteEntries(entries) {
    localStorage.setItem(getQuoteLocalStorageKey(), JSON.stringify(entries));
}

function setQuoteNotice(message = '') {
    const notice = document.getElementById('quote-storage-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
}

function setQuoteFormError(message = '') {
    const errorEl = document.getElementById('quote-entry-form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
}

function showQuoteToast(message = 'Đã sao chép câu quote!') {
    const toast = document.getElementById('quote-toast');
    const msgEl = document.getElementById('quote-toast-message');
    if (!toast) return;
    if (msgEl) msgEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

function handleQuoteSearchInput(e) {
    state.quoteSearchQuery = (e.target.value || '').trim();
    const clearBtn = document.getElementById('btn-clear-quote-search');
    if (clearBtn) clearBtn.hidden = !state.quoteSearchQuery;
    renderQuoteEntries();
}

function clearQuoteSearch() {
    state.quoteSearchQuery = '';
    const input = document.getElementById('quote-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('btn-clear-quote-search');
    if (clearBtn) clearBtn.hidden = true;
    renderQuoteEntries();
}

function setQuoteFilter(filter = 'all') {
    state.quoteCurrentFilter = filter;
    document.getElementById('btn-quote-filter-all')?.classList.toggle('active', filter === 'all');
    document.getElementById('btn-quote-filter-fav')?.classList.toggle('active', filter === 'fav');
    renderQuoteEntries();
}

function normalizeQuoteText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

function updateQuoteHeroBanner() {
    const heroText = document.getElementById('quote-hero-text');
    const heroAuthor = document.getElementById('quote-hero-author');
    if (!heroText || !heroAuthor) return;

    const entries = state.quoteEntries || [];
    if (!entries.length) {
        heroText.textContent = '“Hành trình vạn dặm luôn bắt đầu từ một bước chân nhỏ bé.”';
        heroAuthor.textContent = '— Lão Tử';
        return;
    }

    const idx = Math.abs(state.quoteHeroIndex || 0) % entries.length;
    const current = entries[idx];
    const cleanQuote = String(current?.quote || '').normalize('NFC');
    const cleanAuthor = String(current?.author || 'Khuyết danh').normalize('NFC');
    heroText.textContent = `“${cleanQuote}”`;
    heroAuthor.textContent = `— ${cleanAuthor}`;
}

function shuffleQuoteHero() {
    const entries = state.quoteEntries || [];
    if (!entries.length) {
        showQuoteToast('Chưa có câu quote nào để đổi!');
        return;
    }
    state.quoteHeroIndex = (state.quoteHeroIndex + 1) % entries.length;
    updateQuoteHeroBanner();
    showQuoteToast('✨ Đã đổi câu cảm hứng!');
}

function copyHeroQuote() {
    const heroText = document.getElementById('quote-hero-text')?.textContent || '';
    const heroAuthor = document.getElementById('quote-hero-author')?.textContent || '';
    copyQuoteToClipboard(heroText.replace(/^[“"]|[”"]$/g, ''), heroAuthor.replace(/^—\s*/, ''));
}

async function toggleQuoteFavorite(id, e) {
    if (e) e.stopPropagation();
    const entry = (state.quoteEntries || []).find(q => q.id === id);
    if (!entry) return;

    entry.is_favorite = !entry.is_favorite;

    if (state.quoteStorageMode === 'local' || !supabaseClient || !state.currentUserId) {
        const localEntries = loadLocalQuoteEntries().map(q => q.id === id ? { ...q, is_favorite: entry.is_favorite } : q);
        saveLocalQuoteEntries(localEntries);
    } else {
        try {
            await supabaseClient
                .from('quote_entries')
                .update({ is_favorite: entry.is_favorite })
                .eq('id', id)
                .eq('user_id', state.currentUserId);
        } catch (err) {
            console.warn('Không thể cập nhật favorite lên Supabase:', err);
        }
    }

    showQuoteToast(entry.is_favorite ? '❤️ Đã lưu vào mục Yêu thích' : 'Đã bỏ khỏi Yêu thích');
    renderQuoteEntries();
}

async function loadSampleQuotes() {
    if (state.quoteEntries && state.quoteEntries.length > 0) {
        if (!confirm('Bạn có muốn nạp thêm 5 câu danh ngôn mẫu vào danh sách không?')) return;
    }

    const now = new Date().toISOString();
    const newItems = SAMPLE_QUOTES.map((item, idx) => ({
        id: `sample_quote_${Date.now()}_${idx}`,
        user_id: state.currentUserId || 'local',
        quote: item.quote,
        author: item.author,
        is_favorite: idx === 0,
        display_order: (state.quoteEntries?.length || 0) + idx + 1,
        created_at: now,
        updated_at: now
    }));

    if (state.quoteStorageMode === 'supabase' && supabaseClient && state.currentUserId) {
        try {
            const toInsert = newItems.map(item => ({
                user_id: state.currentUserId,
                quote: item.quote,
                author: item.author,
                is_favorite: item.is_favorite,
                display_order: item.display_order
            }));
            const { data, error } = await supabaseClient
                .from('quote_entries')
                .insert(toInsert)
                .select();

            if (!error && data) {
                state.quoteEntries = [...data, ...(state.quoteEntries || [])];
            } else {
                state.quoteEntries = [...newItems, ...(state.quoteEntries || [])];
                saveLocalQuoteEntries(state.quoteEntries);
            }
        } catch (err) {
            state.quoteEntries = [...newItems, ...(state.quoteEntries || [])];
            saveLocalQuoteEntries(state.quoteEntries);
        }
    } else {
        state.quoteEntries = [...newItems, ...(state.quoteEntries || [])];
        saveLocalQuoteEntries(state.quoteEntries);
    }

    showQuoteToast('✨ Đã nạp 5 câu danh ngôn truyền cảm hứng!');
    renderQuoteEntries();
}

function renderQuoteEntries() {
    const container = document.getElementById('quote-cards-container');
    const countAllEl = document.getElementById('quote-count-all');
    const countFavEl = document.getElementById('quote-count-fav');
    if (!container) return;

    container.replaceChildren();
    const allEntries = state.quoteEntries || [];
    const favCount = allEntries.filter(q => q.is_favorite).length;

    const headerCountEl = document.getElementById('quote-entry-count');
    if (headerCountEl) headerCountEl.textContent = `${allEntries.length}`;
    if (countAllEl) countAllEl.textContent = `${allEntries.length}`;
    if (countFavEl) countFavEl.textContent = `${favCount}`;

    updateQuoteHeroBanner();

    let entries = [...allEntries];

    if (state.quoteCurrentFilter === 'fav') {
        entries = entries.filter(q => Boolean(q.is_favorite));
    }

    if (state.quoteSearchQuery) {
        const queryNorm = normalizeQuoteText(state.quoteSearchQuery);
        entries = entries.filter(q =>
            normalizeQuoteText(q.quote).includes(queryNorm) ||
            normalizeQuoteText(q.author).includes(queryNorm)
        );
    }

    if (!entries.length) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'quote-empty-container';
        const isFiltering = Boolean(state.quoteSearchQuery);
        const isFavTab = state.quoteCurrentFilter === 'fav';

        let title = 'Chưa có câu trích dẫn nào';
        let desc = 'Hãy lưu lại những câu nói truyền năng lượng và cảm hứng cho bạn mỗi ngày.';

        if (isFiltering) {
            title = 'Không tìm thấy kết quả';
            desc = `Không có câu trích dẫn nào khớp với từ khóa “${state.quoteSearchQuery}”.`;
        } else if (isFavTab) {
            title = 'Chưa có trích dẫn yêu thích';
            desc = 'Hãy bấm vào biểu tượng trái tim ở góc thẻ để thêm câu nói vào danh sách yêu thích.';
        }

        emptyDiv.innerHTML = `
            <div class="quote-empty-icon-wrap">
                <i data-lucide="${isFiltering ? 'search-x' : (isFavTab ? 'heart' : 'quote')}"></i>
            </div>
            <h3 class="quote-empty-title">${title}</h3>
            <p class="quote-empty-desc">${desc}</p>
            <div class="quote-empty-actions">
                ${!isFiltering && !isFavTab ? `
                    <button type="button" class="quote-empty-btn-primary" id="btn-empty-add-quote">
                        <i data-lucide="plus"></i>
                        <span>Thêm câu quote đầu tiên</span>
                    </button>
                    <button type="button" class="quote-empty-btn-secondary" id="btn-empty-sample-quotes">
                        <i data-lucide="sparkle"></i>
                        <span>Nạp 5 câu danh ngôn mẫu</span>
                    </button>
                ` : `
                    <button type="button" class="quote-empty-btn-secondary" id="btn-empty-reset-filter">
                        <i data-lucide="rotate-ccw"></i>
                        <span>Xem tất cả trích dẫn</span>
                    </button>
                `}
            </div>
        `;

        emptyDiv.querySelector('#btn-empty-add-quote')?.addEventListener('click', () => openQuoteEntryModal());
        emptyDiv.querySelector('#btn-empty-sample-quotes')?.addEventListener('click', loadSampleQuotes);
        emptyDiv.querySelector('#btn-empty-reset-filter')?.addEventListener('click', () => {
            clearQuoteSearch();
            setQuoteFilter('all');
        });

        container.appendChild(emptyDiv);
        createLucideIcons();
        return;
    }

    const isSelecting = Boolean(state.quoteSelectionMode);

    entries.forEach((entry, index) => {
        const card = document.createElement('div');
        card.className = `quote-card ${isSelecting ? (state.quoteSelectionMode === 'edit' ? 'is-edit-mode' : 'is-delete-mode') : ''}`;
        card.dataset.quoteId = entry.id;

        // Watermark quote mark
        const watermark = document.createElement('div');
        watermark.className = 'quote-card-watermark';
        watermark.textContent = '“';
        card.appendChild(watermark);

        // Header Row
        const headerRow = document.createElement('div');
        headerRow.className = 'quote-card-header-row';

        const indexBadge = document.createElement('span');
        indexBadge.className = 'quote-card-index';
        indexBadge.textContent = `#${String(index + 1).padStart(2, '0')}`;
        headerRow.appendChild(indexBadge);

        const topActions = document.createElement('div');
        topActions.className = 'quote-card-top-actions';

        if (isSelecting) {
            const badge = document.createElement('span');
            badge.className = 'quote-card-select-badge';
            if (state.quoteSelectionMode === 'edit') {
                badge.innerHTML = '<i data-lucide="pencil" style="width:13px;height:13px;"></i> Sửa';
            } else {
                badge.innerHTML = '<i data-lucide="trash-2" style="width:13px;height:13px;"></i> Xóa';
            }
            topActions.appendChild(badge);
            card.addEventListener('click', () => handleQuoteSelection(entry.id));
        } else {
            // Nút Yêu thích
            const favBtn = document.createElement('button');
            favBtn.type = 'button';
            favBtn.className = `quote-fav-btn ${entry.is_favorite ? 'is-fav' : ''}`;
            favBtn.title = entry.is_favorite ? 'Bỏ yêu thích' : 'Đánh dấu yêu thích';
            favBtn.setAttribute('aria-label', favBtn.title);
            favBtn.innerHTML = '<i data-lucide="heart"></i>';
            favBtn.addEventListener('click', (e) => toggleQuoteFavorite(entry.id, e));
            topActions.appendChild(favBtn);
        }

        headerRow.appendChild(topActions);
        card.appendChild(headerRow);

        // Quote text
        const cleanQuote = String(entry.quote || '').normalize('NFC');
        const text = document.createElement('p');
        text.className = 'quote-card-text';
        text.textContent = `“${cleanQuote}”`;
        card.appendChild(text);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'quote-card-footer';

        const authorChip = document.createElement('div');
        authorChip.className = 'quote-author-chip';

        const authorName = String(entry.author || 'Khuyết danh').normalize('NFC').trim();
        const initial = authorName.charAt(0).toUpperCase() || 'K';

        const avatar = document.createElement('div');
        avatar.className = 'quote-author-avatar';
        avatar.textContent = initial;
        authorChip.appendChild(avatar);

        const authorLabel = document.createElement('span');
        authorLabel.className = 'quote-author-name';
        authorLabel.textContent = authorName;
        authorChip.appendChild(authorLabel);

        footer.appendChild(authorChip);

        if (!isSelecting) {
            const actionBtns = document.createElement('div');
            actionBtns.className = 'quote-card-action-btns';

            // Nút sao chép
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'quote-card-btn';
            copyBtn.title = 'Sao chép câu quote';
            copyBtn.setAttribute('aria-label', copyBtn.title);
            copyBtn.innerHTML = '<i data-lucide="copy"></i>';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyQuoteToClipboard(entry.quote, entry.author, copyBtn);
            });
            actionBtns.appendChild(copyBtn);

            // Nút sửa nhanh
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'quote-card-btn';
            editBtn.title = 'Chỉnh sửa';
            editBtn.setAttribute('aria-label', editBtn.title);
            editBtn.innerHTML = '<i data-lucide="pencil"></i>';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openQuoteEntryModal(entry.id);
            });
            actionBtns.appendChild(editBtn);

            // Nút xóa nhanh
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'quote-card-btn';
            delBtn.title = 'Xóa câu quote';
            delBtn.setAttribute('aria-label', delBtn.title);
            delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteQuoteEntry(entry.id);
            });
            actionBtns.appendChild(delBtn);

            footer.appendChild(actionBtns);
        }

        card.appendChild(footer);
        container.appendChild(card);
    });

    createLucideIcons();
}

function setQuoteSelectionMode(mode) {
    state.quoteSelectionMode = state.quoteSelectionMode === mode ? null : mode;
    const modal = document.getElementById('quote-modal');
    if (modal) {
        if (state.quoteSelectionMode) modal.setAttribute('data-selection-mode', state.quoteSelectionMode);
        else modal.removeAttribute('data-selection-mode');
    }
    const editBtn = document.getElementById('btn-edit-quote-entry');
    const deleteBtn = document.getElementById('btn-delete-quote-entry');
    if (editBtn) editBtn.setAttribute('aria-pressed', state.quoteSelectionMode === 'edit' ? 'true' : 'false');
    if (deleteBtn) deleteBtn.setAttribute('aria-pressed', state.quoteSelectionMode === 'delete' ? 'true' : 'false');
    renderQuoteEntries();
}

function handleQuoteSelection(id) {
    if (!id || !state.quoteSelectionMode) return;
    if (state.quoteSelectionMode === 'edit') {
        openQuoteEntryModal(id);
    } else {
        deleteQuoteEntry(id);
    }
}

async function copyQuoteToClipboard(quoteText, authorText, buttonEl) {
    const cleanQuote = String(quoteText || '').trim();
    const cleanAuthor = String(authorText || 'Khuyết danh').trim();
    const fullText = `“${cleanQuote}”\n— ${cleanAuthor}`;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullText);
        } else {
            const ta = document.createElement('textarea');
            ta.value = fullText;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        showQuoteToast('✓ Đã sao chép câu trích dẫn!');
        if (buttonEl) {
            const originalHtml = buttonEl.innerHTML;
            buttonEl.innerHTML = '<i data-lucide="check"></i>';
            createLucideIcons();
            setTimeout(() => {
                buttonEl.innerHTML = originalHtml;
                createLucideIcons();
            }, 1800);
        }
    } catch (err) {
        console.warn('Lỗi chép vào clipboard:', err);
    }
}

function openQuoteEntryModal(entryId = null) {
    const parentModal = document.getElementById('quote-modal');
    const modal = document.getElementById('quote-entry-modal');
    const titleEl = document.getElementById('quote-entry-form-title');
    const quoteInput = document.getElementById('quote-entry-text');
    const authorInput = document.getElementById('quote-entry-author');
    if (!modal) return;

    state.quoteEditingEntryId = entryId;
    setQuoteFormError('');

    if (entryId) {
        const entry = (state.quoteEntries || []).find(q => q.id === entryId);
        if (titleEl) titleEl.textContent = 'Chỉnh sửa trích dẫn';
        if (quoteInput) quoteInput.value = (entry?.quote || '').normalize('NFC');
        if (authorInput) authorInput.value = entry?.author && entry.author !== 'Khuyết danh' ? entry.author.normalize('NFC') : '';
    } else {
        if (titleEl) titleEl.textContent = 'Thêm trích dẫn mới';
        if (quoteInput) quoteInput.value = '';
        if (authorInput) authorInput.value = '';
    }

    if (parentModal) parentModal.classList.add('is-subpage-hidden');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    window.scrollTo({ top: 0, behavior: 'instant' });
    pushAppView('quote-entry-modal');
    setTimeout(() => quoteInput?.focus(), 80);
    createLucideIcons();
}

function closeQuoteEntryModal(closeParent = false, fromHistory = false) {
    const parentModal = document.getElementById('quote-modal');
    const modal = document.getElementById('quote-entry-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (parentModal) parentModal.classList.remove('is-subpage-hidden');
    state.quoteEditingEntryId = null;
    setQuoteFormError('');
    if (!fromHistory) leaveAppView();
    if (closeParent === true) closeQuoteModal(true, fromHistory);
}

function saveLocalQuoteEntryDirect(quote, author, editingId) {
    const cleanQuote = String(quote || '').normalize('NFC');
    const cleanAuthor = String(author || 'Khuyết danh').normalize('NFC');
    const entries = loadLocalQuoteEntries();
    const now = new Date().toISOString();
    if (editingId) {
        const next = entries.map(entry => entry.id === editingId ? { ...entry, quote: cleanQuote, author: cleanAuthor, updated_at: now } : entry);
        saveLocalQuoteEntries(next);
        state.quoteEntries = next;
    } else {
        const newEntry = {
            id: `local_quote_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            user_id: state.currentUserId || 'local',
            quote: cleanQuote,
            author: cleanAuthor,
            is_favorite: false,
            display_order: entries.length + 1,
            created_at: now,
            updated_at: now
        };
        entries.unshift(newEntry);
        saveLocalQuoteEntries(entries);
        state.quoteEntries = entries;
    }
    state.quoteSelectionMode = null;
    document.getElementById('btn-edit-quote-entry')?.setAttribute('aria-pressed', 'false');
    renderQuoteEntries();
}

async function handleQuoteEntrySubmit(event) {
    event.preventDefault();
    const quoteInput = document.getElementById('quote-entry-text');
    const authorInput = document.getElementById('quote-entry-author');
    const quote = (quoteInput?.value || '').trim().normalize('NFC');
    let author = (authorInput?.value || '').trim().normalize('NFC');
    if (!author) author = 'Khuyết danh';

    if (!quote) {
        setQuoteFormError('Vui lòng nhập nội dung câu quote.');
        quoteInput?.focus();
        return;
    }

    const editingId = state.quoteEditingEntryId;

    if (state.quoteStorageMode === 'local' || !supabaseClient || !state.currentUserId) {
        saveLocalQuoteEntryDirect(quote, author, editingId);
        showQuoteToast(editingId ? '✓ Đã cập nhật câu quote!' : '✓ Đã thêm câu quote mới!');
        closeQuoteEntryModal();
        return;
    }

    try {
        if (editingId) {
            const { data, error } = await supabaseClient
                .from('quote_entries')
                .update({
                    quote,
                    author,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingId)
                .eq('user_id', state.currentUserId)
                .select()
                .single();

            if (error) {
                if (isMissingQuoteTable(error)) {
                    state.quoteStorageMode = 'local';
                    saveLocalQuoteEntryDirect(quote, author, editingId);
                    setQuoteNotice('Chưa có bảng quote_entries. Hãy chạy file supabase_quotes.sql để đồng bộ Supabase.');
                    closeQuoteEntryModal();
                    return;
                }
                setQuoteFormError(error.message || 'Không thể cập nhật câu quote.');
                return;
            }

            state.quoteEntries = state.quoteEntries.map(entry => entry.id === editingId ? data : entry);
            showQuoteToast('✓ Đã cập nhật câu quote!');
        } else {
            const maxOrder = state.quoteEntries.reduce((max, entry) => Math.max(max, Number(entry.display_order) || 0), 0);
            const { data, error } = await supabaseClient
                .from('quote_entries')
                .insert({
                    user_id: state.currentUserId,
                    quote,
                    author,
                    is_favorite: false,
                    display_order: maxOrder + 1
                })
                .select()
                .single();

            if (error) {
                if (isMissingQuoteTable(error)) {
                    state.quoteStorageMode = 'local';
                    saveLocalQuoteEntryDirect(quote, author, null);
                    setQuoteNotice('Chưa có bảng quote_entries. Hãy chạy file supabase_quotes.sql để đồng bộ Supabase.');
                    closeQuoteEntryModal();
                    return;
                }
                setQuoteFormError(error.message || 'Không thể thêm câu quote.');
                return;
            }

            state.quoteEntries.unshift(data);
            showQuoteToast('✓ Đã thêm câu quote mới!');
        }

        state.quoteSelectionMode = null;
        document.getElementById('btn-edit-quote-entry')?.setAttribute('aria-pressed', 'false');
        renderQuoteEntries();
        closeQuoteEntryModal();
    } catch (err) {
        console.error('Lỗi lưu quote:', err);
        setQuoteFormError('Đã xảy ra lỗi khi lưu câu quote.');
    }
}

async function deleteQuoteEntry(id) {
    if (!id) return;
    const entry = state.quoteEntries.find(q => q.id === id);
    const shortQuote = entry?.quote ? (entry.quote.length > 40 ? entry.quote.substring(0, 40) + '...' : entry.quote) : '';
    if (!confirm(`Bạn có chắc muốn xóa câu quote “${shortQuote}” không?`)) return;

    if (state.quoteStorageMode === 'local' || !supabaseClient || !state.currentUserId) {
        const entries = loadLocalQuoteEntries().filter(q => q.id !== id);
        saveLocalQuoteEntries(entries);
        state.quoteEntries = entries;
        state.quoteSelectionMode = null;
        document.getElementById('btn-delete-quote-entry')?.setAttribute('aria-pressed', 'false');
        showQuoteToast('Đã xóa câu quote.');
        renderQuoteEntries();
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('quote_entries')
            .delete()
            .eq('id', id)
            .eq('user_id', state.currentUserId);

        if (error) {
            if (isMissingQuoteTable(error)) {
                state.quoteStorageMode = 'local';
                const entries = loadLocalQuoteEntries().filter(q => q.id !== id);
                saveLocalQuoteEntries(entries);
                state.quoteEntries = entries;
            } else {
                console.error('Không thể xóa câu quote:', error);
                alert('Không thể xóa câu quote. Vui lòng thử lại.');
                return;
            }
        } else {
            state.quoteEntries = state.quoteEntries.filter(q => q.id !== id);
        }
        state.quoteSelectionMode = null;
        document.getElementById('btn-delete-quote-entry')?.setAttribute('aria-pressed', 'false');
        showQuoteToast('Đã xóa câu quote.');
        renderQuoteEntries();
    } catch (err) {
        console.error('Lỗi xóa quote:', err);
    }
}

async function fetchQuoteEntries() {
    if (!supabaseClient || !state.currentUserId) {
        state.quoteStorageMode = 'local';
        state.quoteEntries = loadLocalQuoteEntries();
        renderQuoteEntries();
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('quote_entries')
            .select('id,quote,author,is_favorite,display_order,created_at,updated_at')
            .eq('user_id', state.currentUserId)
            .order('created_at', { ascending: false });

        if (error) {
            if (isMissingQuoteTable(error)) {
                state.quoteStorageMode = 'local';
                state.quoteEntries = loadLocalQuoteEntries();
                setQuoteNotice('Chưa có bảng quote_entries. Hãy chạy file supabase_quotes.sql để đồng bộ Supabase.');
            } else {
                console.error('Không thể tải Quotes:', error);
                state.quoteEntries = [];
                setQuoteNotice(error.message || 'Không thể tải Trích dẫn.');
            }
        } else {
            state.quoteStorageMode = 'supabase';
            state.quoteEntries = (data || []).map(entry => ({
                ...entry,
                quote: String(entry?.quote || '').normalize('NFC'),
                author: String(entry?.author || 'Khuyết danh').normalize('NFC')
            }));
            setQuoteNotice('');
        }
    } catch (err) {
        console.error('Lỗi tải quotes:', err);
        state.quoteStorageMode = 'local';
        state.quoteEntries = loadLocalQuoteEntries();
    }
    renderQuoteEntries();
}


export default function start(user){
 state.currentUserId=user;supabaseClient=getClient();
    const btnOpenQuote = document.getElementById('welcome-opt-quote');
    if (btnOpenQuote) btnOpenQuote.addEventListener('click', openQuoteModal);
    const btnCloseQuote = document.getElementById('btn-close-quote-modal');
    if (btnCloseQuote) btnCloseQuote.addEventListener('click', closeQuoteModal);
    const btnAddQuote = document.getElementById('btn-add-quote-entry');
    if (btnAddQuote) btnAddQuote.addEventListener('click', () => openQuoteEntryModal());
    const btnEditQuote = document.getElementById('btn-edit-quote-entry');
    if (btnEditQuote) btnEditQuote.addEventListener('click', () => setQuoteSelectionMode('edit'));
    const btnDeleteQuote = document.getElementById('btn-delete-quote-entry');
    if (btnDeleteQuote) btnDeleteQuote.addEventListener('click', () => setQuoteSelectionMode('delete'));
    const btnCloseQuoteEntry = document.getElementById('btn-close-quote-entry-modal');
    if (btnCloseQuoteEntry) btnCloseQuoteEntry.addEventListener('click', () => closeQuoteEntryModal(false, false));
    const btnCancelQuoteEntry = document.getElementById('btn-cancel-quote-entry');
    if (btnCancelQuoteEntry) btnCancelQuoteEntry.addEventListener('click', () => closeQuoteEntryModal(false, false));
    const quoteEntryForm = document.getElementById('quote-entry-form');
    if (quoteEntryForm) quoteEntryForm.addEventListener('submit', handleQuoteEntrySubmit);
    const quoteSearchInput = document.getElementById('quote-search-input');
    if (quoteSearchInput) quoteSearchInput.addEventListener('input', handleQuoteSearchInput);
    const btnClearQuoteSearch = document.getElementById('btn-clear-quote-search');
    if (btnClearQuoteSearch) btnClearQuoteSearch.addEventListener('click', clearQuoteSearch);
    const quoteEntryModal = document.getElementById('quote-entry-modal');
    if (quoteEntryModal) {
        quoteEntryModal.addEventListener('click', event => {
            if (event.target.id === 'quote-entry-modal') closeQuoteEntryModal();
        });
    }

    // Sự kiện nâng cao cho bảng show Trích dẫn
    const btnShuffleHero = document.getElementById('btn-shuffle-hero-quote');
    if (btnShuffleHero) btnShuffleHero.addEventListener('click', shuffleQuoteHero);
    const btnCopyHero = document.getElementById('btn-copy-hero-quote');
    if (btnCopyHero) btnCopyHero.addEventListener('click', copyHeroQuote);
    const btnFilterAll = document.getElementById('btn-quote-filter-all');
    if (btnFilterAll) btnFilterAll.addEventListener('click', () => setQuoteFilter('all'));
    const btnFilterFav = document.getElementById('btn-quote-filter-fav');
    if (btnFilterFav) btnFilterFav.addEventListener('click', () => setQuoteFilter('fav'));
    const btnLoadSamples = document.getElementById('btn-load-sample-quotes');
    if (btnLoadSamples) btnLoadSamples.addEventListener('click', loadSampleQuotes);
    const authorChipsContainer = document.getElementById('quote-author-chips');
    if (authorChipsContainer) {
        authorChipsContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.quote-chip-btn');
            if (chip && chip.dataset.author) {
                const authorInput = document.getElementById('quote-entry-author');
                if (authorInput) {
                    authorInput.value = chip.dataset.author;
                    authorInput.focus();
                }
            }
        });
    }

initNavigation('quote-modal',{'quote-entry-modal':()=>closeQuoteEntryModal(true,true)});
 openQuoteModal();
}
