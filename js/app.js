/**
 * Money - Quản Lý Chi Tiêu Mobile Web App
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

// Sắp xếp chi tiêu: Ngày mới nhất lên đầu, nếu cùng ngày thì ID lớn nhất (mới nhất) lên đầu
function sortExpenses() {
    state.expenses.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id.localeCompare(a.id);
    });
}

// Cấu hình Emoji & Màu sắc cho từng Phân loại
const CATEGORY_STYLES = {
    "Ăn uống": { emoji: "🍔", bg: "rgba(255, 159, 10, 0.12)", color: "#ff9f0a" },
    "Mua sắm": { emoji: "🛒", bg: "rgba(191, 90, 242, 0.12)", color: "#bf5af2" },
    "Di chuyển": { emoji: "🚗", bg: "rgba(10, 132, 255, 0.12)", color: "#0a84ff" },
    "Giải trí": { emoji: "🍿", bg: "rgba(255, 69, 58, 0.12)", color: "#ff453a" },
    "Sinh hoạt": { emoji: "💡", bg: "rgba(94, 92, 230, 0.12)", color: "#5e5ce6" },
    "Khác": { emoji: "📝", bg: "rgba(142, 142, 147, 0.12)", color: "#8e8e93" }
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
    const savedExpenses = localStorage.getItem('money_expenses') || localStorage.getItem('ispend_expenses');
    if (savedExpenses) {
        try {
            state.expenses = JSON.parse(savedExpenses);
            sortExpenses();
        } catch (e) {
            console.error("Lỗi parse dữ liệu chi tiêu:", e);
            state.expenses = [];
        }
    } else {
        // Tạo một số dữ liệu mẫu ban đầu để giao diện đẹp ngay lập tức
        state.expenses = getSampleData();
        sortExpenses();
        saveData();
    }

    // Tự động kết nối Supabase
    initSupabase();
}

// LƯU DỮ LIỆU XUỐNG LOCALSTORAGE
function saveData() {
    localStorage.setItem('money_expenses', JSON.stringify(state.expenses));
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

// Định dạng Giờ & Ngày chi tiết: Vd 10:12 AM 22/07/26
function formatDateTimeVietnamese(exp) {
    if (!exp) return '';
    let d;
    if (exp.created_at) {
        d = new Date(exp.created_at);
    } else if (exp.id && exp.id.startsWith('exp-')) {
        const parts = exp.id.split('-');
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts)) {
            d = new Date(ts);
        }
    }
    
    if (!d || isNaN(d.getTime())) {
        if (exp.date) {
            const parts = exp.date.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
            }
        }
        return exp.date || '';
    }

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = hours.toString().padStart(2, '0');

    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-2);

    return `${hoursStr}:${minutes} ${ampm} ${day}/${month}/${year}`;
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

    // Định dạng số tiền nhập ở ô chỉnh sửa
    const detailAmountInput = document.getElementById('detail-amount-input');
    if (detailAmountInput) {
        detailAmountInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '');
            if (val) {
                e.target.value = parseInt(val, 10).toLocaleString('vi-VN');
            } else {
                e.target.value = '';
            }
        });
    }

    // Tìm kiếm lịch sử
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderHistoryList();
    });






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
    document.body.style.overflow = 'hidden'; // Khóa cuộn màn hình nền
}

function closeAddModal() {
    document.getElementById('add-expense-modal').classList.remove('active');
    document.body.style.overflow = ''; // Mở khóa cuộn màn hình nền
    document.getElementById('add-expense-form').reset();
}

function openDetailModal(expenseId) {
    const exp = state.expenses.find(item => item.id === expenseId);
    if (!exp) return;

    document.getElementById('detail-amount-input').value = exp.amount.toLocaleString('vi-VN');
    document.getElementById('detail-title-input').value = exp.title;
    document.getElementById('detail-category-select').value = exp.category || 'Khác';
    document.getElementById('detail-date').innerText = formatDateTimeVietnamese(exp);

    // Nút Xóa
    const deleteBtn = document.getElementById('btn-delete-expense');
    deleteBtn.onclick = () => {
        if (confirm(`Bạn có chắc chắn muốn xóa chi tiêu "${exp.title}" không?`)) {
            deleteExpense(exp.id);
            closeDetailModal();
        }
    };

    // Nút Lưu thay đổi
    const saveBtn = document.getElementById('btn-save-edit-expense');
    saveBtn.onclick = () => saveEditedExpense(exp.id);

    document.getElementById('detail-expense-modal').classList.add('active');
    document.body.style.overflow = 'hidden'; // Khóa cuộn màn hình nền
}

function saveEditedExpense(id) {
    const exp = state.expenses.find(item => item.id === id);
    if (!exp) return;

    const amountRaw = document.getElementById('detail-amount-input').value.replace(/\D/g, '');
    const amount = parseInt(amountRaw, 10);
    if (isNaN(amount) || amount <= 0) {
        alert('Vui lòng nhập số tiền chi tiêu hợp lệ lớn hơn 0!');
        return;
    }

    const title = document.getElementById('detail-title-input').value.trim();
    if (!title) {
        alert('Vui lòng nhập nội dung chi tiêu!');
        return;
    }

    const category = document.getElementById('detail-category-select').value;

    exp.amount = amount;
    exp.title = title;
    exp.category = category;

    sortExpenses();
    saveData();
    updateUI();

    // Đồng bộ lên Supabase nếu có
    if (supabaseClient) {
        supabaseClient
            .from('expenses')
            .update({
                amount: exp.amount,
                title: exp.title,
                category: exp.category
            })
            .eq('id', id)
            .then(({ error }) => {
                if (error) {
                    console.error("Lỗi khi cập nhật giao dịch lên Supabase:", error);
                } else {
                    console.log("Đã cập nhật giao dịch lên Supabase thành công.");
                }
            });
    }

    closeDetailModal();
}

function closeDetailModal() {
    document.getElementById('detail-expense-modal').classList.remove('active');
    document.body.style.overflow = ''; // Mở khóa cuộn màn hình nền
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
    
    // Lấy phân loại
    const category = document.getElementById('expense-category').value;
    
    // Lấy ngày
    const date = document.getElementById('expense-date').value;

    // Tạo đối tượng chi tiêu mới (sử dụng ID chứa timestamp để sắp xếp)
    const newExpense = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        amount: amount,
        title: title,
        category: category,
        date: date
    };

    // Lưu vào state và LocalStorage
    state.expenses.unshift(newExpense); // Đưa lên hàng đầu tiên
    sortExpenses();
    saveData();

    // Tự động đồng bộ lên Supabase trong nền (nếu đã cấu hình)
    if (supabaseClient) {
        supabaseClient
            .from('expenses')
            .insert([{
                id: newExpense.id,
                date: newExpense.date,
                title: newExpense.title,
                amount: newExpense.amount,
                category: newExpense.category
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
    
    const style = CATEGORY_STYLES[exp.category] || CATEGORY_STYLES["Khác"];
    
    itemEl.innerHTML = `
        <div class="item-left">
            <div class="item-icon-wrapper font-emoji" style="background-color: ${style.bg}; color: ${style.color}; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; width: 40px; height: 40px; border-radius: 12px;">
                ${style.emoji}
            </div>
            <div class="item-details">
                <div class="item-title">${exp.title}</div>
                <div class="item-meta">
                    <span>${formatDateTimeVietnamese(exp)}</span>
                </div>
            </div>
        </div>
        <div class="item-right">
            <div class="item-amount">-${formatCurrency(exp.amount)}</div>
        </div>
    `;
    return itemEl;
}

// VẼ BIỂU ĐỒ CƠ CẤU CHI TIÊU Ở DASHBOARD
function renderDashboardCharts() {
    const todayObj = new Date();
    const currentYear = todayObj.getFullYear();
    const currentMonth = todayObj.getMonth();

    // Lọc chi tiêu trong tháng hiện tại
    const currentMonthExpenses = state.expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getFullYear() === currentYear && expDate.getMonth() === currentMonth;
    });

    // Gom nhóm tổng tiền theo phân loại
    const categoryTotals = {};
    let totalSum = 0;

    currentMonthExpenses.forEach(exp => {
        const cat = exp.category || 'Khác';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.amount;
        totalSum += exp.amount;
    });

    const labels = [];
    const data = [];
    const colors = [];
    const breakdownList = [];

    // Sắp xếp danh mục có số tiền nhiều nhất lên đầu
    const sortedCategories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);

    sortedCategories.forEach(cat => {
        const amount = categoryTotals[cat];
        const pct = totalSum > 0 ? ((amount / totalSum) * 100).toFixed(1) : 0;
        const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES["Khác"];

        labels.push(cat);
        data.push(amount);
        colors.push(style.color);

        breakdownList.push({
            category: cat,
            amount: amount,
            pct: pct,
            emoji: style.emoji,
            color: style.color
        });
    });

    // Khởi tạo biểu đồ Doughnut
    initCategoryDoughnutChart('categoryChart', labels, data, colors);

    // Vẽ danh sách cơ cấu % chi tiết ở dưới biểu đồ
    const legendContainer = document.getElementById('category-breakdown-legend');
    if (legendContainer) {
        legendContainer.innerHTML = '';

        if (breakdownList.length === 0) {
            legendContainer.innerHTML = `
                <div class="empty-state" style="padding: 10px 0;">
                    <p style="font-size: 0.78rem; color: var(--text-secondary);">Tháng này chưa có chi tiêu nào để phân tích.</p>
                </div>
            `;
            return;
        }

        breakdownList.forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; padding: 7px 0; border-bottom: 1px dashed rgba(255,255,255,0.06);';
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1rem;">${item.emoji}</span>
                    <span style="font-weight: 600; color: var(--text-primary);">${item.category}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--text-secondary); font-size: 0.75rem;">${formatCurrency(item.amount)}</span>
                    <span style="font-weight: 700; color: ${item.color}; min-width: 45px; text-align: right;">${item.pct}%</span>
                </div>
            `;
            legendContainer.appendChild(row);
        });
    }
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
            
    } catch (err) {
        console.error("Lỗi khởi tạo Supabase:", err);
    }
}

// Lấy danh sách chi tiêu từ Supabase
async function fetchExpensesFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('expenses')
            .select('*');
            
        if (error) throw error;
        
        if (data) {
            state.expenses = data;
            sortExpenses(); // Sắp xếp sau khi fetch
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
            sortExpenses();
        }
    } else if (eventType === 'DELETE') {
        state.expenses = state.expenses.filter(e => e.id !== oldRecord.id);
    } else if (eventType === 'UPDATE') {
        const idx = state.expenses.findIndex(e => e.id === newRecord.id);
        if (idx !== -1) {
            state.expenses[idx] = newRecord;
            sortExpenses();
        }
    }
    
    saveData();
    updateUI();
}
