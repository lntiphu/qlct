/**
 * iSpend - Quản Lý Chi Tiêu Mobile Web App
 * Core Application Logic
 */

// STATE SYSTEM
const state = {
    expenses: [],
    currentTab: 'dashboard',
    searchQuery: '',
    supabaseUrl: 'https://ghdydszifdaiphcjguri.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZHlkc3ppZmRhaXBoY2pndXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjAzOTgsImV4cCI6MjEwMDE5NjM5OH0.ZTpS0cdmmCO4eH41nXFGQpnAELgD5iMwOEpl_mG7S1c'
};
let supabaseClient = null;
let supabaseSubscription = null;

// KHỞI CHẠY ỨNG DỤNG
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initUI();
    registerEventListeners();
    switchTab('dashboard'); // Mặc định hiển thị tab dashboard
    updateUI();
});

// LOAD DỮ LIỆU TỪ LOCALSTORAGE
function loadData() {
    const savedExpenses = localStorage.getItem('ispend_expenses');
    if (savedExpenses) {
        try {
            state.expenses = JSON.parse(savedExpenses);
        } catch (e) {
            console.error("Lỗi parse dữ liệu chi tiêu:", e);
            state.expenses = [];
        }
    } else {
        // Tạo một số dữ liệu mẫu ban đầu để giao diện đẹp ngay lập tức
        state.expenses = getSampleData();
        saveData();
    }



    const savedUrl = localStorage.getItem('ispend_supabase_url');
    const savedKey = localStorage.getItem('ispend_supabase_key');
    if (savedUrl && savedKey) {
        state.supabaseUrl = savedUrl;
        state.supabaseKey = savedKey;
    }
    
    // Khởi tạo Supabase nếu có thông tin (từ localStorage hoặc cấu hình mặc định)
    if (state.supabaseUrl && state.supabaseKey) {
        // Chờ DOM load xong rồi gán giá trị và init
        setTimeout(() => {
            const urlInput = document.getElementById('setting-supabase-url');
            const keyInput = document.getElementById('setting-supabase-key');
            if (urlInput) urlInput.value = state.supabaseUrl;
            if (keyInput) keyInput.value = state.supabaseKey;
            
            initSupabase();
        }, 100);
    }
}

// LƯU DỮ LIỆU XUỐNG LOCALSTORAGE
function saveData() {
    localStorage.setItem('ispend_expenses', JSON.stringify(state.expenses));
}

// DỮ LIỆU MẪU BAN ĐẦU
function getSampleData() {
    return [];
}

// ĐỊNH DẠNG NGÀY & TIỀN TỆ
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', 'đ');
}

function getTodayDateString() {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    return localISOTime;
}

function getDateOffsetString(offsetDays) {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const date = new Date(Date.now() - tzoffset + (offsetDays * 24 * 60 * 60 * 1000));
    return date.toISOString().slice(0, 10);
}

function getVietnameseDayOfWeek(dateStr) {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

function formatDateStringVietnamese(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    
    // So sánh xem có phải hôm nay / hôm qua không
    const today = getTodayDateString();
    const yesterday = getDateOffsetString(-1);
    
    if (dateStr === today) {
        return 'Hôm nay';
    } else if (dateStr === yesterday) {
        return 'Hôm qua';
    } else {
        const dayOfWeek = getVietnameseDayOfWeek(dateStr);
        return `${dayOfWeek}, ${day}/${month}/${year}`;
    }
}

// KHỞI TẠO CÁC PHẦN TỬ UI BAN ĐẦU
function initUI() {
    // Cập nhật ngày tháng trên header
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentDateVal = now.getDate();
    const currentMonthVal = now.getMonth() + 1;
    document.getElementById('current-date').innerText = `${currentDay}, ngày ${currentDateVal} tháng ${currentMonthVal}`;

    // Đặt ngày mặc định cho form nhập là ngày hôm nay
    document.getElementById('expense-date').value = getTodayDateString();

    // Khởi tạo Lucide Icons
    createLucideIcons();
}

// ĐĂNG KÝ SỰ KIỆN TƯƠNG TÁC (EVENT LISTENERS)
function registerEventListeners() {
    // Sự kiện thanh điều hướng dưới (Tabs Switch)
    const navItems = document.querySelectorAll('.app-nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // Bấm xem tất cả ở Dashboard chuyển sang History tab
    document.getElementById('btn-see-all').addEventListener('click', () => {
        switchTab('history');
    });

    // Mở / Đóng Modal Thêm Chi Tiêu
    document.getElementById('btn-open-add-modal').addEventListener('click', openAddModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeAddModal);
    document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
    document.getElementById('add-expense-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-expense-modal') closeAddModal();
    });

    // Định dạng số tiền nhập trực tiếp (Chỉ cho phép số và thêm dấu phẩy phân cách hàng nghìn)
    const amountInput = document.getElementById('expense-amount');
    amountInput.addEventListener('input', (e) => {
        let val = e.target.value;
        // Loại bỏ mọi ký tự không phải số
        val = val.replace(/\D/g, '');
        if (val) {
            // Định dạng phân tách phần nghìn
            e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
        } else {
            e.target.value = '';
        }
    });

    // Submit form thêm mới
    document.getElementById('add-expense-form').addEventListener('submit', handleAddExpenseSubmit);

    // Mở / Đóng chi tiết chi tiêu
    document.getElementById('btn-close-detail').addEventListener('click', closeDetailModal);
    document.getElementById('detail-expense-modal').addEventListener('click', (e) => {
        if (e.target.id === 'detail-expense-modal') closeDetailModal();
    });

    // Tìm kiếm lịch sử
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderHistoryList();
    });





    // Sao lưu xuất dữ liệu (JSON)
    document.getElementById('btn-export-data').addEventListener('click', exportData);
    document.getElementById('btn-backup-trigger').addEventListener('click', () => {
        switchTab('reports');
        // Cuộn tới phần Backup
        document.querySelector('.settings-card').scrollIntoView({ behavior: 'smooth' });
    });

    // Nhập dữ liệu (JSON)
    const importFileInput = document.getElementById('import-file-input');
    document.getElementById('btn-import-data-trigger').addEventListener('click', () => {
        importFileInput.click();
    });
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importData(file);
        }
    });

    // Xóa toàn bộ dữ liệu
    document.getElementById('btn-clear-all-data').addEventListener('click', clearAllData);

    // Cấu hình URL và Key Supabase
    document.getElementById('setting-supabase-url').addEventListener('input', (e) => {
        state.supabaseUrl = e.target.value.trim();
        if (!state.supabaseUrl) {
            localStorage.removeItem('ispend_supabase_url');
            updateSupabaseStatusUI('disconnected');
        }
    });
    
    document.getElementById('setting-supabase-key').addEventListener('input', (e) => {
        state.supabaseKey = e.target.value.trim();
        if (!state.supabaseKey) {
            localStorage.removeItem('ispend_supabase_key');
            updateSupabaseStatusUI('disconnected');
        }
    });

    // Các nút kết nối & đồng bộ dữ liệu
    document.getElementById('btn-connect-supabase').addEventListener('click', connectSupabase);
    document.getElementById('btn-sync-local-to-supabase').addEventListener('click', syncLocalToSupabase);
}

// XỬ LÝ CHUYỂN TAB
function switchTab(tabId) {
    state.currentTab = tabId;
    
    // Cập nhật trạng thái Active trên Navigation
    const navItems = document.querySelectorAll('.app-nav .nav-item');
    navItems.forEach(item => {
        const isTarget = item.getAttribute('data-tab') === tabId;
        item.classList.toggle('active', isTarget);
    });

    // Cập nhật hiển thị Panel
    const panels = document.querySelectorAll('.app-main .tab-panel');
    panels.forEach(panel => {
        const isTarget = panel.getAttribute('id') === `tab-${tabId}`;
        panel.classList.toggle('active', isTarget);
    });

    // Cập nhật lại UI cụ thể khi chuyển tab (ví dụ: Biểu đồ)
    if (tabId === 'dashboard') {
        renderDashboardCharts();
    } else if (tabId === 'history') {
        renderHistoryList();
    }
}



// CÁC HÀM MỞ/ĐÓNG MODAL
function openAddModal() {
    // Đặt lại ngày mặc định là hôm nay
    document.getElementById('expense-date').value = getTodayDateString();
    document.getElementById('add-expense-modal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('add-expense-modal').classList.remove('active');
    document.getElementById('add-expense-form').reset();
}

function openDetailModal(expenseId) {
    const exp = state.expenses.find(item => item.id === expenseId);
    if (!exp) return;

    document.getElementById('detail-amount').innerText = formatCurrency(exp.amount);
    document.getElementById('detail-title').innerText = exp.title;
    document.getElementById('detail-date').innerText = formatDateStringVietnamese(exp.date);

    // Nút Xóa
    const deleteBtn = document.getElementById('btn-delete-expense');
    deleteBtn.onclick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa chi tiêu "${exp.title}" không?`)) {
            deleteExpense(exp.id);
            closeDetailModal();
        }
    };

    document.getElementById('detail-expense-modal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detail-expense-modal').classList.remove('active');
}

// THÊM CHI TIÊU MỚI (SUBMIT FORM)
function handleAddExpenseSubmit(e) {
    e.preventDefault();

    // Lấy số tiền
    const amountRaw = document.getElementById('expense-amount').value.replace(/\D/g, '');
    const amount = parseInt(amountRaw, 10);
    
    if (isNaN(amount) || amount <= 0) {
        alert('Vui lòng nhập số tiền chi tiêu hợp lệ lớn hơn 0!');
        return;
    }

    // Lấy tên/nội dung
    const title = document.getElementById('expense-title').value.trim();
    
    // Lấy ngày
    const date = document.getElementById('expense-date').value;

    // Tạo đối tượng chi tiêu mới
    const newExpense = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        amount: amount,
        title: title,
        date: date
    };

    // Lưu vào state và LocalStorage
    state.expenses.unshift(newExpense); // Đưa lên hàng đầu tiên
    saveData();

    // Tự động đồng bộ lên Supabase trong nền (nếu đã cấu hình)
    if (supabaseClient) {
        supabaseClient
            .from('expenses')
            .insert([{
                id: newExpense.id,
                date: newExpense.date,
                title: newExpense.title,
                amount: newExpense.amount
            }])
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi thêm giao dịch lên Supabase:", error);
                } else {
                    console.log("Đã thêm giao dịch lên Supabase thành công.");
                }
            });
    }

    // Đóng modal và reset
    closeAddModal();

    // Cập nhật lại giao diện và thông báo thành công
    updateUI();
    
    // Hiệu ứng Toast đơn giản hoặc chỉ cần chuyển về Dashboard
    switchTab('dashboard');
}

// XÓA KHOẢN CHI TIÊU
function deleteExpense(id) {
    const expenseToDelete = state.expenses.find(item => item.id === id);
    
    // Xóa cục bộ trên thiết bị trước
    state.expenses = state.expenses.filter(item => item.id !== id);
    saveData();
    updateUI();

    // Nếu đã kết nối Supabase, tự động xóa dòng tương ứng
    if (supabaseClient) {
        supabaseClient
            .from('expenses')
            .delete()
            .eq('id', id)
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi xóa giao dịch trên Supabase:", error);
                } else {
                    console.log("Đã xóa giao dịch thành công trên Supabase.");
                }
            });
    }
}

// CẬP NHẬT GIAO DIỆN CHÍNH
function updateUI() {
    calculateAndRenderSummaries();
    renderRecentSpendings();

    // Cập nhật hiển thái trạng thái đồng bộ Supabase
    if (supabaseClient) {
        updateSupabaseStatusUI('connected');
    } else {
        updateSupabaseStatusUI('disconnected');
    }
    
    if (state.currentTab === 'dashboard') {
        renderDashboardCharts();
    } else if (state.currentTab === 'history') {
        renderHistoryList();
    }
}

// TÍNH TOÁN VÀ HIỂN THỊ CÁC THẺ TỔNG KẾT
function calculateAndRenderSummaries() {
    const today = getTodayDateString();
    
    // Xác định phạm vi Tuần này (Thứ Hai -> Chủ Nhật)
    const todayObj = new Date();
    const dayOfWeek = todayObj.getDay(); // 0: Chủ nhật, 1: T2, 6: T7
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Tính ngày chênh lệch để tìm T2
    
    const startOfWeek = new Date(todayObj);
    startOfWeek.setDate(todayObj.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Xác định Tháng này
    const currentYear = todayObj.getFullYear();
    const currentMonth = todayObj.getMonth(); // 0 -> 11

    let totalToday = 0;
    let totalWeek = 0;
    let totalMonth = 0;

    state.expenses.forEach(exp => {
        const expDate = new Date(exp.date);
        
        // So sánh Ngày hôm nay
        if (exp.date === today) {
            totalToday += exp.amount;
        }

        // So sánh Tuần này
        if (expDate >= startOfWeek && expDate <= endOfWeek) {
            totalWeek += exp.amount;
        }

        // So sánh Tháng này
        if (expDate.getFullYear() === currentYear && expDate.getMonth() === currentMonth) {
            totalMonth += exp.amount;
        }
    });

    // Cập nhật giá trị hiển thị trên thẻ
    document.getElementById('sum-today').innerText = formatCurrency(totalToday);
    document.getElementById('sum-week').innerText = formatCurrency(totalWeek);
    document.getElementById('sum-month').innerText = formatCurrency(totalMonth);

}

// HIỂN THỊ GIAO DỊCH GẦN ĐÂY (Ở TRANG CHỦ)
function renderRecentSpendings() {
    const recentListContainer = document.getElementById('recent-spendings-list');
    recentListContainer.innerHTML = '';

    // Lấy 4 giao dịch gần nhất
    const recentExpenses = state.expenses.slice(0, 4);

    if (recentExpenses.length === 0) {
        recentListContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="inbox"></i>
                <p>Chưa có chi tiêu nào. Bấm (+) để thêm!</p>
            </div>
        `;
        createLucideIcons();
        return;
    }

    recentExpenses.forEach(exp => {
        const itemEl = createTransactionDOMItem(exp);
        recentListContainer.appendChild(itemEl);
    });

    createLucideIcons();
}

// TẠO PHẦN TỬ LIÊN KẾT GIAO DỊCH TRONG DOM
function createTransactionDOMItem(exp) {
    const itemEl = document.createElement('div');
    itemEl.className = 'transaction-item';
    itemEl.onclick = () => openDetailModal(exp.id);
    
    itemEl.innerHTML = `
        <div class="item-left">
            <div class="item-icon-wrapper font-emoji" style="background-color: rgba(10, 132, 255, 0.12); color: #0a84ff; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; width: 40px; height: 40px; border-radius: 12px;">
                💰
            </div>
            <div class="item-details">
                <div class="item-title">${exp.title}</div>
                <div class="item-meta">
                    <span>${formatDateStringVietnamese(exp.date)}</span>
                </div>
            </div>
        </div>
        <div class="item-right">
            <div class="item-amount">-${formatCurrency(exp.amount)}</div>
        </div>
    `;
    return itemEl;
}

// VẼ BIỂU ĐỒ Ở DASHBOARD
function renderDashboardCharts() {
    // Biểu đồ xu hướng tuần (7 ngày gần nhất)
    const daysLabel = [];
    const values = [];
    
    // Tính toán lượng chi tiêu cho 7 ngày qua
    for (let i = 6; i >= 0; i--) {
        const dateStr = getDateOffsetString(-i);
        const dayName = getVietnameseDayOfWeek(dateStr);
        // Định dạng ngắn gọn cho chart trục x (T2, T3... CN)
        const chartDayLabel = dayName === 'Chủ Nhật' ? 'CN' : dayName.replace('Thứ ', 'T');
        daysLabel.push(chartDayLabel);

        // Cộng dồn chi tiêu trong ngày đó
        let sum = 0;
        state.expenses.forEach(exp => {
            if (exp.date === dateStr) {
                sum += exp.amount;
            }
        });
        values.push(sum);
    }

    initWeeklyChart('weeklyChart', daysLabel, values);
}

// HIỂN THỊ DANH SÁCH LỊCH SỬ (HISTORY TAB)
function renderHistoryList() {
    const historyListContainer = document.getElementById('history-spendings-list');
    historyListContainer.innerHTML = '';

    // Lọc dữ liệu theo Từ khóa tìm kiếm
    let filtered = state.expenses;

    if (state.searchQuery.trim() !== '') {
        const query = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(exp => 
            exp.title.toLowerCase().includes(query) || 
            exp.amount.toString().includes(query)
        );
    }

    if (filtered.length === 0) {
        historyListContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="search-code"></i>
                <p>Không tìm thấy khoản chi tiêu nào phù hợp.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Nhóm giao dịch theo ngày chi tiêu
    const groups = {};
    filtered.forEach(exp => {
        if (!groups[exp.date]) {
            groups[exp.date] = [];
        }
        groups[exp.date].push(exp);
    });

    // Sắp xếp ngày mới nhất lên trên
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(dateStr => {
        // Vẽ header ngày
        const headerEl = document.createElement('div');
        headerEl.className = 'transaction-group-date';
        headerEl.innerText = formatDateStringVietnamese(dateStr);
        historyListContainer.appendChild(headerEl);

        // Vẽ các giao dịch trong ngày
        groups[dateStr].forEach(exp => {
            const itemEl = createTransactionDOMItem(exp);
            historyListContainer.appendChild(itemEl);
        });
    });

    createLucideIcons();
}



// XUẤT DỮ LIỆU SANG JSON
function exportData() {
    const dataStr = JSON.stringify({
        expenses: state.expenses,
        budget: state.budget,
        version: "1.0"
    }, null, 2);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '_');
    const filename = `ispend_backup_${dateStr}.json`;

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// NHẬP DỮ LIỆU TỪ FILE JSON
function importData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported && Array.isArray(imported.expenses)) {
                // Hợp nhất hoặc ghi đè (ở đây chúng ta ghi đè)
                state.expenses = imported.expenses;
                if (imported.budget && typeof imported.budget === 'number') {
                    state.budget = imported.budget;
                }
                saveData();
                updateUI();
                alert('Nhập dữ liệu thành công! Đã khôi phục ' + state.expenses.length + ' khoản chi tiêu.');
                switchTab('dashboard');
            } else {
                alert('Tệp sao lưu không hợp lệ. Vui lòng thử lại!');
            }
        } catch (err) {
            console.error("Lỗi đọc file backup:", err);
            alert('Có lỗi xảy ra khi đọc tệp backup. Hãy chắc chắn đó là tệp .json hợp lệ!');
        }
    };
    reader.readAsText(file);
}

// XÓA TOÀN BỘ DỮ LIỆU
function clearAllData() {
    if (confirm('CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn TOÀN BỘ lịch sử chi tiêu của bạn trên thiết bị này. Bạn có chắc chắn muốn tiếp tục không?')) {
        state.expenses = [];
        saveData();
        updateUI();
        alert('Đã xóa sạch dữ liệu.');
        switchTab('dashboard');
    }
}

// Bản đồ ánh xạ từ mã Icon Lucide sang Emoji tương ứng để chạy offline
const LUCIDE_EMOJI_FALLBACKS = {
    "layout-dashboard": "📊",
    "receipt": "📝",
    "plus": "➕",
    "pie-chart": "📈",
    "calendar": "📅",
    "trending-up": "📈",
    "credit-card": "💳",
    "database": "💾",
    "search": "🔍",
    "tag": "🏷️",
    "file-text": "📄",
    "check": "✅",
    "x": "❌",
    "trash-2": "🗑️",
    "camera": "📷",
    "image": "🖼️",
    "inbox": "📥"
};

// Hàm bổ trợ gọi Lucide Icons an toàn
function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    } else {
        console.warn("Lucide Icons is not loaded. Using emoji fallback.");
        const icons = document.querySelectorAll('i[data-lucide]');
        icons.forEach(icon => {
            const iconName = icon.getAttribute('data-lucide');
            const fallbackEmoji = LUCIDE_EMOJI_FALLBACKS[iconName];
            if (fallbackEmoji) {
                icon.innerHTML = fallbackEmoji;
                icon.style.fontStyle = 'normal';
                icon.style.fontSize = '1.25rem';
                icon.style.display = 'inline-flex';
                icon.style.alignItems = 'center';
                icon.style.justifyContent = 'center';
            }
        });
    }
}

// ==========================================================================
// SUPABASE SYNCHRONIZATION HELPERS
// ==========================================================================

// Kiểm tra và cập nhật giao diện kết nối Supabase
function updateSupabaseStatusUI(status) {
    const statusText = document.getElementById('supabase-status-text');
    const syncNowBtn = document.getElementById('btn-sync-local-to-supabase');
    if (!statusText || !syncNowBtn) return;
    
    if (status === 'connected') {
        statusText.innerText = "🟢 Đã kết nối Supabase Real-time";
        statusText.className = "status-connected";
        syncNowBtn.style.display = 'block';
    } else if (status === 'syncing') {
        statusText.innerText = "🟡 Đang kết nối...";
        statusText.className = "status-syncing";
        syncNowBtn.style.display = 'none';
    } else {
        statusText.innerText = "❌ Chưa kết nối Supabase";
        statusText.className = "status-disconnected";
        syncNowBtn.style.display = 'none';
    }
}

// Khởi tạo Supabase Client và Đăng ký Real-time listener
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.warn("Supabase SDK is not loaded.");
        return;
    }
    
    if (!state.supabaseUrl || !state.supabaseKey) return;
    
    try {
        supabaseClient = supabase.createClient(state.supabaseUrl, state.supabaseKey);
        
        // 1. Tải toàn bộ chi tiêu từ Cloud về máy lần đầu
        fetchExpensesFromSupabase();
        
        // 2. Đăng ký nhận sự thay đổi dữ liệu thời gian thực (Real-time listener)
        if (supabaseSubscription) {
            supabaseSubscription.unsubscribe();
        }
        
        supabaseSubscription = supabaseClient
            .channel('expenses-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, payload => {
                handleRealtimeDbChange(payload);
            })
            .subscribe();
            
        updateSupabaseStatusUI('connected');
    } catch (err) {
        console.error("Lỗi khởi tạo Supabase:", err);
        updateSupabaseStatusUI('disconnected');
    }
}

// Lấy danh sách chi tiêu từ Supabase
async function fetchExpensesFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('expenses')
            .select('*')
            .order('date', { ascending: false });
            
        if (error) throw error;
        
        if (data) {
            state.expenses = data;
            saveData();
            updateUI();
        }
    } catch (err) {
        console.error("Lỗi khi fetch chi tiêu từ Supabase:", err);
    }
}

// Xử lý sự kiện Real-time từ DB
function handleRealtimeDbChange(payload) {
    console.log("Phát hiện thay đổi DB Real-time:", payload);
    const eventType = payload.eventType;
    const newRecord = payload.new;
    const oldRecord = payload.old;
    
    if (eventType === 'INSERT') {
        if (!state.expenses.some(e => e.id === newRecord.id)) {
            state.expenses.unshift(newRecord);
            state.expenses.sort((a, b) => b.date.localeCompare(a.date));
        }
    } else if (eventType === 'DELETE') {
        state.expenses = state.expenses.filter(e => e.id !== oldRecord.id);
    } else if (eventType === 'UPDATE') {
        const idx = state.expenses.findIndex(e => e.id === newRecord.id);
        if (idx !== -1) {
            state.expenses[idx] = newRecord;
            state.expenses.sort((a, b) => b.date.localeCompare(a.date));
        }
    }
    
    saveData();
    updateUI();
}

// Bấm kết nối Supabase từ UI Cài đặt
async function connectSupabase() {
    const urlInput = document.getElementById('setting-supabase-url').value.trim();
    const keyInput = document.getElementById('setting-supabase-key').value.trim();
    
    if (!urlInput || !keyInput) {
        alert("Vui lòng nhập cả URL dự án và Anon Key!");
        return;
    }
    
    updateSupabaseStatusUI('syncing');
    
    try {
        const testClient = supabase.createClient(urlInput, keyInput);
        
        // Thử thực hiện một truy vấn SELECT đơn giản để kiểm tra kết nối
        const { data, error } = await testClient
            .from('expenses')
            .select('id')
            .limit(1);
            
        if (error) throw error;
        
        // Lưu thông tin kết nối thành công
        state.supabaseUrl = urlInput;
        state.supabaseKey = keyInput;
        localStorage.setItem('ispend_supabase_url', urlInput);
        localStorage.setItem('ispend_supabase_key', keyInput);
        
        supabaseClient = testClient;
        
        // Triển khai kết nối thực tế
        initSupabase();
        
        alert("Kết nối Supabase thành công! Dữ liệu sẽ tự động đồng bộ thời gian thực.");
    } catch (err) {
        console.error(err);
        alert("Kết nối thất bại! Hãy chắc chắn bạn đã tạo bảng 'expenses' đúng cấu trúc trong Supabase và RLS đã được cấu hình cho phép truy cập public.\nChi tiết lỗi: " + err.message);
        updateSupabaseStatusUI('disconnected');
    }
}

// Đồng bộ ngược dữ liệu cũ từ máy lên Supabase
async function syncLocalToSupabase() {
    if (!supabaseClient || state.expenses.length === 0) return;
    
    if (!confirm(`Bạn có muốn đẩy toàn bộ ${state.expenses.length} khoản chi tiêu hiện tại trên máy lên đám mây Supabase không? (Các giao dịch trùng ID sẽ bị ghi đè)`)) {
        return;
    }
    
    updateSupabaseStatusUI('syncing');
    
    try {
        const { error } = await supabaseClient
            .from('expenses')
            .upsert(state.expenses.map(e => ({
                id: e.id,
                date: e.date,
                title: e.title,
                amount: e.amount
            })));
            
        if (error) throw error;
        
        alert("Đồng bộ dữ liệu cục bộ lên đám mây thành công!");
        fetchExpensesFromSupabase(); // Load lại
        updateSupabaseStatusUI('connected');
    } catch (err) {
        console.error(err);
        alert("Lỗi đồng bộ dữ liệu lên: " + err.message);
        updateSupabaseStatusUI('connected');
    }
}
