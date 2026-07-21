/**
 * iSpend - Quản Lý Chi Tiêu Mobile Web App
 * Core Application Logic
 */

// STATE SYSTEM
const state = {
    expenses: [],
    currentTab: 'dashboard',
    searchQuery: '',
    sheetsUrl: null // Đường dẫn Google Apps Script Web App
};

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



    const savedUrl = localStorage.getItem('ispend_sheets_url');
    if (savedUrl) {
        state.sheetsUrl = savedUrl;
        // Chờ DOM load xong rồi gán giá trị
        setTimeout(() => {
            const input = document.getElementById('setting-sheets-url');
            if (input) input.value = savedUrl;
            updateSyncStatusUI('connected');
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

    // Cấu hình URL đồng bộ Google Sheets
    const sheetsUrlInput = document.getElementById('setting-sheets-url');
    sheetsUrlInput.addEventListener('input', (e) => {
        state.sheetsUrl = e.target.value.trim();
        if (!state.sheetsUrl) {
            localStorage.removeItem('ispend_sheets_url');
            updateSyncStatusUI('disconnected');
        }
    });

    // Các nút kiểm tra kết nối & đồng bộ dữ liệu
    document.getElementById('btn-test-sync').addEventListener('click', testSyncConnection);
    document.getElementById('btn-sync-now').addEventListener('click', syncAllUnsynced);
    document.getElementById('btn-pull-sheets').addEventListener('click', pullDataFromSheets);
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

    // Tự động đồng bộ lên Google Sheets trong nền (nếu đã cấu hình)
    if (state.sheetsUrl) {
        syncToGoogleSheets(newExpense).then(success => {
            if (success) {
                console.log("Tự động đồng bộ giao dịch mới lên Google Sheets thành công.");
                updateSyncStatusUI('connected'); // Cập nhật lại số lượng hàng chưa đồng bộ
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

    // Nếu đã kết nối Google Sheets, tự động gửi yêu cầu xóa dòng tương ứng
    if (state.sheetsUrl && expenseToDelete) {
        fetch(state.sheetsUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({
                action: "delete",
                id: id
            })
        }).then(response => response.json())
          .then(result => {
              if (result && result.status === 'success') {
                  console.log("Đã xóa giao dịch thành công trên Google Sheets.");
                  updateSyncStatusUI('connected');
              }
          }).catch(err => {
              console.error("Lỗi khi gửi yêu cầu xóa lên Google Sheets:", err);
          });
    }
}

// CẬP NHẬT GIAO DIỆN CHÍNH
function updateUI() {
    calculateAndRenderSummaries();
    renderRecentSpendings();

    // Cập nhật hiển thị trạng thái đồng bộ Google Sheets
    if (state.sheetsUrl) {
        updateSyncStatusUI('connected');
    } else {
        updateSyncStatusUI('disconnected');
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
// GOOGLE SHEETS SYNCHRONIZATION HELPERS
// ==========================================================================

// Hàm kiểm tra trạng thái và cập nhật giao diện kết nối
function updateSyncStatusUI(status) {
    const statusText = document.getElementById('sync-status-text');
    const syncNowBtn = document.getElementById('btn-sync-now');
    const pullSheetsBtn = document.getElementById('btn-pull-sheets');
    if (!statusText || !syncNowBtn || !pullSheetsBtn) return;
    
    if (status === 'connected') {
        statusText.innerText = "🟢 Đã kết nối Google Sheets";
        statusText.className = "status-connected";
        pullSheetsBtn.style.display = 'block';
        // Đếm số dòng chưa được đồng bộ (không có cờ synced)
        const unsyncedCount = state.expenses.filter(e => !e.synced).length;
        if (unsyncedCount > 0) {
            syncNowBtn.style.display = 'block';
            syncNowBtn.innerText = `Đồng bộ ${unsyncedCount} dữ liệu cũ`;
        } else {
            syncNowBtn.style.display = 'none';
        }
    } else if (status === 'syncing') {
        statusText.innerText = "🟡 Đang đồng bộ...";
        statusText.className = "status-syncing";
        syncNowBtn.style.display = 'none';
        pullSheetsBtn.style.display = 'none';
    } else {
        statusText.innerText = "❌ Chưa kết nối Google Sheets";
        statusText.className = "status-disconnected";
        syncNowBtn.style.display = 'none';
        pullSheetsBtn.style.display = 'none';
    }
}

// Đồng bộ một giao dịch đơn lẻ lên Google Sheets
async function syncToGoogleSheets(expense) {
    if (!state.sheetsUrl) return false;
    
    try {
        const response = await fetch(state.sheetsUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain' // Bỏ qua CORS preflight của trình duyệt
            },
            body: JSON.stringify(expense)
        });
        
        const result = await response.json();
        if (result && result.status === 'success') {
            expense.synced = true;
            saveData();
            return true;
        }
        return false;
    } catch (err) {
        console.error("Lỗi kết nối đồng bộ:", err);
        return false;
    }
}

// Kiểm tra kết nối đến Web App Apps Script
async function testSyncConnection() {
    if (!state.sheetsUrl) {
        alert('Vui lòng nhập URL Web App Google Apps Script trước!');
        return;
    }
    
    updateSyncStatusUI('syncing');
    
    try {
        const response = await fetch(state.sheetsUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({ test: true })
        });
        
        const result = await response.json();
        if (result && result.status === 'success') {
            localStorage.setItem('ispend_sheets_url', state.sheetsUrl);
            alert('Kết nối đến Google Sheets thành công!');
            updateSyncStatusUI('connected');
        } else {
            alert('Kết nối thất bại: ' + (result ? result.message : 'Phản hồi không hợp lệ'));
            updateSyncStatusUI('disconnected');
        }
    } catch (err) {
        console.error(err);
        alert('Kết nối thất bại. Chắc chắn bạn đã Deploy Web App ở chế độ "Anyone" công khai!\nChi tiết lỗi: ' + err.toString());
        updateSyncStatusUI('disconnected');
    }
}

// Đồng bộ tất cả dữ liệu cũ chưa sync
async function syncAllUnsynced() {
    const unsyncedItems = state.expenses.filter(e => !e.synced);
    if (unsyncedItems.length === 0) return;
    
    updateSyncStatusUI('syncing');
    
    try {
        const response = await fetch(state.sheetsUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(unsyncedItems)
        });
        
        const result = await response.json();
        if (result && result.status === 'success') {
            unsyncedItems.forEach(item => {
                item.synced = true;
            });
            saveData();
            alert(`Đồng bộ thành công ${unsyncedItems.length} khoản chi tiêu lên Google Trang tính!`);
            updateSyncStatusUI('connected');
            updateUI();
        } else {
            alert('Đồng bộ thất bại: ' + (result ? result.message : 'Không phản hồi'));
            updateSyncStatusUI('connected');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối đồng bộ loạt: ' + err.toString());
        updateSyncStatusUI('connected');
    }
}

// Tải dữ liệu ngược từ Google Sheets về máy
async function pullDataFromSheets() {
    if (!state.sheetsUrl) return;
    
    if (!confirm("Hành động này sẽ tải về toàn bộ chi tiêu từ Google Sheets và ghi đè lên dữ liệu chi tiêu hiện tại trên máy bạn. Bạn có muốn tiếp tục không?")) {
        return;
    }
    
    updateSyncStatusUI('syncing');
    
    try {
        const response = await fetch(state.sheetsUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify({ action: 'fetch' })
        });
        
        const result = await response.json();
        if (result && result.status === 'success' && Array.isArray(result.expenses)) {
            state.expenses = result.expenses;
            saveData();
            updateUI();
            alert(`Tải thành công ${result.expenses.length} khoản chi tiêu từ Google Sheets về máy!`);
            updateSyncStatusUI('connected');
        } else {
            alert('Tải dữ liệu thất bại: ' + (result ? result.message : 'Không có phản hồi'));
            updateSyncStatusUI('connected');
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối tải dữ liệu: ' + err.toString());
        updateSyncStatusUI('connected');
    }
}
