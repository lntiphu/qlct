/**
 * iSpend - Quản Lý Chi Tiêu Mobile Web App
 * Core Application Logic
 */

// STATE SYSTEM
const state = {
    expenses: [],
    budget: 10000000, // Hạn mức tháng mặc định (10 triệu VND)
    currentTab: 'dashboard',
    activeCategoryFilter: 'all',
    searchQuery: '',
    newExpenseImage: null, // Lưu trữ base64 của ảnh mới chụp/chọn
    sheetsUrl: null // Đường dẫn Google Apps Script Web App
};

// CATEGORY ICON CONFIG
const CATEGORY_ICONS = {
    "Ăn uống": "🍔",
    "Mua sắm": "🛍️",
    "Di chuyển": "🚗",
    "Giải trí": "🎉",
    "Hóa đơn": "⚡",
    "Khác": "📦"
};

const CATEGORY_CLASSES = {
    "Ăn uống": "cat-anuong",
    "Mua sắm": "cat-muasam",
    "Di chuyển": "cat-dichuyen",
    "Giải trí": "cat-giaitri",
    "Hóa đơn": "cat-hoadon",
    "Khác": "cat-khac"
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

    const savedBudget = localStorage.getItem('ispend_budget');
    if (savedBudget) {
        state.budget = parseInt(savedBudget, 10);
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
    localStorage.setItem('ispend_budget', state.budget.toString());
}

// DỮ LIỆU MẪU BAN ĐẦU
function getSampleData() {
    const todayStr = getTodayDateString();
    const yesterdayStr = getDateOffsetString(-1);
    const threeDaysAgoStr = getDateOffsetString(-3);
    const fiveDaysAgoStr = getDateOffsetString(-5);

    return [
        {
            id: 'sample-1',
            amount: 55000,
            title: 'Phở bò ăn sáng',
            category: 'Ăn uống',
            date: todayStr,
            notes: 'Quán quen đầu ngõ',
            image: null
        },
        {
            id: 'sample-2',
            amount: 32000,
            title: 'Cà phê sữa đá',
            category: 'Ăn uống',
            date: todayStr,
            notes: 'Mua mang đi',
            image: null
        },
        {
            id: 'sample-3',
            amount: 150000,
            title: 'Đổ xăng xe máy',
            category: 'Di chuyển',
            date: yesterdayStr,
            notes: 'Đầy bình xăng xe ga',
            image: null
        },
        {
            id: 'sample-4',
            amount: 1200000,
            title: 'Mua giày thể thao mới',
            category: 'Mua sắm',
            date: threeDaysAgoStr,
            notes: 'Hàng chính hãng sale 20%',
            image: null
        },
        {
            id: 'sample-5',
            amount: 350000,
            title: 'Vé xem phim & Bắp nước',
            category: 'Giải trí',
            date: fiveDaysAgoStr,
            notes: 'Rạp CGV với bạn bè',
            image: null
        },
        {
            id: 'sample-6',
            amount: 450000,
            title: 'Hóa đơn tiền điện nước',
            category: 'Hóa đơn',
            date: fiveDaysAgoStr,
            notes: 'Thanh toán online',
            image: null
        }
    ];
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

    // Chọn danh mục ở Form Thêm Chi Tiêu
    const categoryOptions = document.querySelectorAll('#category-selector-grid .category-tag-option');
    categoryOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            categoryOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
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

    // Upload & Chụp ảnh hóa đơn
    const uploadZone = document.getElementById('photo-dropzone');
    const imageInput = document.getElementById('expense-image-input');
    
    uploadZone.addEventListener('click', (e) => {
        // Tránh kích hoạt lại khi bấm nút Xóa ảnh
        if (e.target.closest('#btn-remove-photo')) return;
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processAndPreviewImage(file);
        }
    });

    // Xóa ảnh đã đính kèm
    document.getElementById('btn-remove-photo').addEventListener('click', (e) => {
        e.stopPropagation();
        removeAttachedPhoto();
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

    // Lọc theo danh mục ở Lịch sử
    const historyFilters = document.querySelectorAll('.history-controls .filter-tag');
    historyFilters.forEach(tag => {
        tag.addEventListener('click', () => {
            historyFilters.forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            state.activeCategoryFilter = tag.getAttribute('data-category');
            renderHistoryList();
        });
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
    } else if (tabId === 'reports') {
        renderReportsTab();
    }
}

// XỬ LÝ ẢNH CHỤP / TẢI LÊN (NÉN & PREVIEW)
function processAndPreviewImage(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // Nén ảnh để tránh tràn bộ nhớ LocalStorage (Giới hạn chiều rộng/cao tối đa 500px)
            const MAX_WIDTH = 500;
            const MAX_HEIGHT = 500;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Nén sang JPEG với chất lượng 0.6
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            state.newExpenseImage = dataUrl;

            // Hiển thị preview lên UI
            document.getElementById('image-preview').src = dataUrl;
            document.getElementById('image-preview-container').style.display = 'block';
            document.getElementById('upload-placeholder-content').style.display = 'none';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function removeAttachedPhoto() {
    state.newExpenseImage = null;
    document.getElementById('expense-image-input').value = '';
    document.getElementById('image-preview').src = '';
    document.getElementById('image-preview-container').style.display = 'none';
    document.getElementById('upload-placeholder-content').style.display = 'flex';
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
    removeAttachedPhoto();
}

function openDetailModal(expenseId) {
    const exp = state.expenses.find(item => item.id === expenseId);
    if (!exp) return;

    document.getElementById('detail-amount').innerText = formatCurrency(exp.amount);
    
    // Gán Badge Danh mục & màu sắc
    const catBadge = document.getElementById('detail-category');
    catBadge.innerText = `${CATEGORY_ICONS[exp.category]} ${exp.category}`;
    catBadge.className = 'detail-category-badge'; // reset class
    catBadge.classList.add(CATEGORY_CLASSES[exp.category]);

    document.getElementById('detail-title').innerText = exp.title;
    document.getElementById('detail-date').innerText = formatDateStringVietnamese(exp.date);
    document.getElementById('detail-notes').innerText = exp.notes || 'Không có ghi chú';

    // Hiển thị ảnh nếu có
    const photoContainer = document.getElementById('detail-photo-container');
    const photoImg = document.getElementById('detail-photo');
    if (exp.image) {
        photoImg.src = exp.image;
        photoContainer.style.display = 'flex';
    } else {
        photoImg.src = '';
        photoContainer.style.display = 'none';
    }

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
    
    // Lấy danh mục đang chọn
    const activeCatEl = document.querySelector('#category-selector-grid .category-tag-option.active');
    const category = activeCatEl ? activeCatEl.getAttribute('data-val') : 'Khác';

    // Lấy ngày và ghi chú
    const date = document.getElementById('expense-date').value;
    const notes = document.getElementById('expense-notes').value.trim();

    // Tạo đối tượng chi tiêu mới
    const newExpense = {
        id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        amount: amount,
        title: title,
        category: category,
        date: date,
        notes: notes,
        image: state.newExpenseImage
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
    } else if (state.currentTab === 'reports') {
        renderReportsTab();
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

    const hasPhotoHtml = exp.image ? `<span class="item-has-photo"><i data-lucide="image"></i> Ảnh đính kèm</span>` : '';
    
    itemEl.innerHTML = `
        <div class="item-left">
            <div class="item-icon-wrapper ${CATEGORY_CLASSES[exp.category]}">
                ${CATEGORY_ICONS[exp.category]}
            </div>
            <div class="item-details">
                <div class="item-title">${exp.title}</div>
                <div class="item-meta">
                    <span>${exp.category}</span>
                    ${hasPhotoHtml}
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

    // Lọc dữ liệu theo Danh mục & Từ khóa tìm kiếm
    let filtered = state.expenses;

    if (state.activeCategoryFilter !== 'all') {
        filtered = filtered.filter(exp => exp.category === state.activeCategoryFilter);
    }

    if (state.searchQuery.trim() !== '') {
        const query = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(exp => 
            exp.title.toLowerCase().includes(query) || 
            (exp.notes && exp.notes.toLowerCase().includes(query)) ||
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

// HIỂN THỊ TRANG BÁO CÁO (REPORTS TAB)
function renderReportsTab() {
    // Cập nhật tiêu đề tháng hiện tại
    const now = new Date();
    const currentMonthVal = now.getMonth() + 1;
    const currentYearVal = now.getFullYear();
    document.getElementById('report-month-year').innerText = `Tháng ${currentMonthVal} / ${currentYearVal}`;

    // Lọc các khoản chi tiêu trong tháng hiện tại
    const currentMonthExpenses = state.expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getFullYear() === currentYearVal && expDate.getMonth() === now.getMonth();
    });

    // Gom nhóm tổng chi theo danh mục
    const categoryTotals = {};
    let totalMonthSum = 0;

    currentMonthExpenses.forEach(exp => {
        if (!categoryTotals[exp.category]) {
            categoryTotals[exp.category] = 0;
        }
        categoryTotals[exp.category] += exp.amount;
        totalMonthSum += exp.amount;
    });

    // Chuẩn bị dữ liệu cho biểu đồ tròn
    const labels = Object.keys(categoryTotals);
    const dataValues = labels.map(label => categoryTotals[label]);

    // Khởi tạo biểu đồ tròn
    initMonthlyCategoryChart('monthlyCategoryChart', labels, dataValues);

    // Vẽ danh sách cơ cấu danh mục kèm Progress bar
    const reportListContainer = document.getElementById('category-report-list');
    reportListContainer.innerHTML = '';

    if (labels.length === 0) {
        reportListContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="pie-chart"></i>
                <p>Tháng này chưa có chi tiêu để báo cáo.</p>
            </div>
        `;
        createLucideIcons();
        return;
    }

    // Sắp xếp danh mục từ nhiều tiền nhất xuống ít nhất
    const sortedCategories = labels.sort((a, b) => categoryTotals[b] - categoryTotals[a]);

    sortedCategories.forEach(cat => {
        const amount = categoryTotals[cat];
        const pct = totalMonthSum > 0 ? Math.round((amount / totalMonthSum) * 100) : 0;
        
        const itemEl = document.createElement('div');
        itemEl.className = 'breakdown-item';
        
        // Tạo thanh phần trăm tương ứng với class danh mục
        const color = CATEGORY_COLORS[cat] || '#8e8e93';

        itemEl.innerHTML = `
            <div class="breakdown-info">
                <span class="breakdown-label">
                    <span>${CATEGORY_ICONS[cat]}</span>
                    <span>${cat}</span>
                </span>
                <span class="breakdown-amount">
                    ${formatCurrency(amount)} <strong>(${pct}%)</strong>
                </span>
            </div>
            <div class="breakdown-bar-bg">
                <div class="breakdown-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
            </div>
        `;
        reportListContainer.appendChild(itemEl);
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
    if (!statusText || !syncNowBtn) return;
    
    if (status === 'connected') {
        statusText.innerText = "🟢 Đã kết nối Google Sheets";
        statusText.className = "status-connected";
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
    } else {
        statusText.innerText = "❌ Chưa kết nối Google Sheets";
        statusText.className = "status-disconnected";
        syncNowBtn.style.display = 'none';
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
            // Thay thế ảnh base64 nặng bằng link ảnh Drive trả về từ API
            if (result.results && result.results[0] && result.results[0].imageUrl) {
                expense.image = result.results[0].imageUrl;
            }
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
            result.results.forEach(res => {
                const item = state.expenses.find(e => e.id === res.id);
                if (item) {
                    item.synced = true;
                    if (res.imageUrl) {
                        item.image = res.imageUrl; // Thay bằng link Drive để giải phóng LocalStorage
                    }
                }
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
