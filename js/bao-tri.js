/**
 * BAO-TRI.JS
 * Tính năng Quản lý Bảo trì & Sửa chữa Thiết bị (Chức năng thứ 12)
 * Phong cách: Warm Terracotta Fintech / Hiện đại
 */

import { goBackToHome } from './utils.js';
import { getClient } from './api.js';

let supabaseClient = null;
let currentUserId = null;

const STORAGE_KEY = 'qlct_maintenance_devices_v1';

/* ── HELPERS ĐỊNH DẠNG NGÀY DD/MM/YYYY CHUẨN VIỆT NAM ── */
function formatISODateToDMY(iso) {
    if (!iso) return '';
    const parts = String(iso).split('T')[0].split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        if (y && m && d) {
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
    }
    return '';
}

function parseDMYToISODate(dmy) {
    if (!dmy) return '';
    const match = String(dmy).trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (match) {
        const [, d, m, y] = match;
        const day = Number(d);
        const month = Number(m);
        const year = Number(y);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return '';
}

function bindCustomDMYPicker(nativeId, displayId, triggerBtnId) {
    const nativeInput = document.getElementById(nativeId);
    const displayInput = document.getElementById(displayId);
    const triggerBtn = document.getElementById(triggerBtnId);

    if (!nativeInput || !displayInput) return;

    if (nativeInput.value) {
        displayInput.value = formatISODateToDMY(nativeInput.value);
    }

    nativeInput.addEventListener('change', () => {
        displayInput.value = formatISODateToDMY(nativeInput.value);
    });
    nativeInput.addEventListener('input', () => {
        displayInput.value = formatISODateToDMY(nativeInput.value);
    });

    if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof nativeInput.showPicker === 'function') {
                try {
                    nativeInput.showPicker();
                    return;
                } catch (err) {}
            }
            nativeInput.focus();
            nativeInput.click();
        });
    }

    displayInput.addEventListener('input', (e) => {
        if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
            let v = displayInput.value.replace(/\D/g, '');
            if (v.length > 8) v = v.slice(0, 8);
            if (v.length >= 5) {
                displayInput.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
            } else if (v.length >= 3) {
                displayInput.value = `${v.slice(0, 2)}/${v.slice(2)}`;
            }
        }
        const val = displayInput.value.trim();
        const iso = parseDMYToISODate(val);
        if (iso) {
            nativeInput.value = iso;
        }
    });

    displayInput.addEventListener('blur', () => {
        if (nativeInput.value) {
            displayInput.value = formatISODateToDMY(nativeInput.value);
        } else {
            const val = displayInput.value.trim();
            if (!val) {
                nativeInput.value = '';
                return;
            }
            const iso = parseDMYToISODate(val);
            if (iso) {
                nativeInput.value = iso;
                displayInput.value = formatISODateToDMY(iso);
            }
        }
    });
}

/* ── SUPABASE SYNC HELPERS ── */
async function syncMaintenanceFromSupabase() {
    if (!supabaseClient || !currentUserId) return;
    try {
        const { data: dbDevices, error: devError } = await supabaseClient
            .from('maintenance_devices')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: true });

        if (devError) {
            console.warn('Supabase maintenance_devices:', devError.message);
            return;
        }

        const { data: dbLogs, error: logError } = await supabaseClient
            .from('maintenance_logs')
            .select('*')
            .eq('user_id', currentUserId)
            .order('maintenance_date', { ascending: false });

        if (logError) {
            console.warn('Supabase maintenance_logs:', logError.message);
            return;
        }

        if (Array.isArray(dbDevices) && dbDevices.length > 0) {
            const logsByDevice = {};
            (dbLogs || []).forEach(l => {
                if (!logsByDevice[l.device_id]) logsByDevice[l.device_id] = [];
                logsByDevice[l.device_id].push({
                    id: l.id,
                    deviceId: l.device_id,
                    title: l.title,
                    cost: Number(l.cost) || 0,
                    date: l.maintenance_date,
                    location: l.location || '',
                    odo: l.odo || '',
                    notes: l.notes || '',
                    createdAt: l.created_at
                });
            });

            devices = dbDevices.map(d => ({
                id: d.id,
                name: d.name,
                category: d.category || 'other',
                code: d.code || '',
                purchaseDate: d.purchase_date || '',
                odo: d.odo || '',
                notes: d.notes || '',
                createdAt: d.created_at,
                logs: logsByDevice[d.id] || []
            }));
            saveDevicesData();
        } else if (devices && devices.length > 0) {
            for (const d of devices) {
                await supabaseUpsertDevice(d);
                for (const l of (d.logs || [])) {
                    await supabaseUpsertLog(l, d.id);
                }
            }
        }
    } catch (err) {
        console.warn('Lỗi kết nối Supabase cho Bảo trì:', err);
    }
}

async function supabaseUpsertDevice(dev) {
    if (!supabaseClient || !currentUserId) return;
    try {
        await supabaseClient.from('maintenance_devices').upsert({
            id: dev.id,
            user_id: currentUserId,
            name: dev.name,
            category: dev.category || 'other',
            code: dev.code || null,
            purchase_date: dev.purchaseDate || null,
            odo: dev.odo || null,
            notes: dev.notes || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    } catch (e) {
        console.warn('Lỗi lưu thiết bị lên Supabase:', e);
    }
}

async function supabaseDeleteDevice(devId) {
    if (!supabaseClient || !currentUserId) return;
    try {
        await supabaseClient.from('maintenance_devices').delete().eq('id', devId).eq('user_id', currentUserId);
    } catch (e) {
        console.warn('Lỗi xóa thiết bị trên Supabase:', e);
    }
}

async function supabaseUpsertLog(log, deviceId) {
    if (!supabaseClient || !currentUserId) return;
    try {
        await supabaseClient.from('maintenance_logs').upsert({
            id: log.id,
            device_id: deviceId,
            user_id: currentUserId,
            title: log.title,
            cost: Number(log.cost) || 0,
            maintenance_date: log.date || new Date().toISOString().split('T')[0],
            location: log.location || null,
            odo: log.odo || null,
            notes: log.notes || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    } catch (e) {
        console.warn('Lỗi lưu lượt bảo trì lên Supabase:', e);
    }
}

async function supabaseDeleteLog(logId) {
    if (!supabaseClient || !currentUserId) return;
    try {
        await supabaseClient.from('maintenance_logs').delete().eq('id', logId).eq('user_id', currentUserId);
    } catch (e) {
        console.warn('Lỗi xóa lượt bảo trì trên Supabase:', e);
    }
}

// Sample Seed Data (Khởi tạo sẵn thiết bị và lượt bảo trì mẫu cho người dùng)
const SEED_DEVICES = [
    {
        id: 'dev_honda_airblade',
        name: 'Xe Honda AirBlade 150',
        category: 'vehicle',
        code: '59-X1 889.99',
        purchaseDate: '2023-03-15',
        odo: '18.500 km',
        notes: 'Xe đi làm hàng ngày. Chu kỳ thay nhớt 2.000km/lần, nhớt láp 3 lần máy 1 lần láp.',
        createdAt: new Date().toISOString(),
        logs: [
            {
                id: 'log_ab_1',
                deviceId: 'dev_honda_airblade',
                title: 'Thay nhớt máy Motul Scooter & Nhớt láp',
                cost: 210000,
                date: '2026-11-12',
                location: 'Head Honda Phát Tiến Q4',
                odo: '18.200 km',
                notes: 'Nhớt máy Motul Scooter Power LE 5W40 + nhớt láp Motul'
            },
            {
                id: 'log_ab_2',
                deviceId: 'dev_honda_airblade',
                title: 'Vệ sinh nồi & thay lọc gió mới',
                cost: 320000,
                date: '2026-08-20',
                location: 'Gara xe máy Tuấn Q.7',
                odo: '15.000 km',
                notes: 'Bi nồi còn tốt, dây curoa còn dày, đã xịt bụi lọc gió'
            }
        ]
    },
    {
        id: 'dev_daikin_ac',
        name: 'Điều hòa Daikin Inverter 1.5HP',
        category: 'appliance',
        code: 'Phòng ngủ lớn',
        purchaseDate: '2023-06-10',
        odo: 'Đang hoạt động êm',
        notes: 'Vệ sinh định kỳ 6 tháng/lần trước mùa nóng',
        createdAt: new Date().toISOString(),
        logs: [
            {
                id: 'log_ac_1',
                deviceId: 'dev_daikin_ac',
                title: 'Vệ sinh dàn lạnh, dàn nóng & bơm gas R32',
                cost: 250000,
                date: '2026-10-05',
                location: 'Điện Lạnh Sài Gòn 24/7',
                odo: 'Chu kỳ 6 tháng',
                notes: 'Máy làm lạnh sâu, đã thông đường ống thoát nước'
            }
        ]
    }
];

let devices = [];
let currentCategory = 'all';
let expandedDevices = new Set();
let pendingDeleteAction = null;

// Category Metadata
const CATEGORY_NAMES = {
    all: 'Tất cả',
    vehicle: '🛵 Phương tiện',
    electronics: '💻 Điện tử',
    appliance: '❄️ Gia dụng',
    other: '📦 Khác'
};

const CATEGORY_ICONS = {
    vehicle: 'bike',
    electronics: 'laptop',
    appliance: 'fan',
    other: 'package'
};

/* ── 1. HELPERS ĐỊNH DẠNG ── */
function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('vi-VN') + ' VNĐ';
}

function formatDateVN(dateStr) {
    if (!dateStr) return '--';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    } catch {
        return dateStr;
    }
}

function parseAmountInput(val) {
    if (!val) return 0;
    const clean = String(val).replace(/[^\d]/g, '');
    return Number(clean) || 0;
}

function formatNumberInput(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
        const caret = inputEl.selectionStart;
        const raw = parseAmountInput(inputEl.value);
        if (raw === 0 && inputEl.value.trim() === '') {
            inputEl.value = '';
            return;
        }
        inputEl.value = raw.toLocaleString('vi-VN');
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

function showToast(msg) {
    const toast = document.getElementById('maintenance-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2400);
}

/* ── 2. DATA PERSISTENCE ── */
function loadDevicesData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            devices = JSON.parse(saved);
        } else {
            devices = JSON.parse(JSON.stringify(SEED_DEVICES));
            saveDevicesData();
        }
    } catch {
        devices = JSON.parse(JSON.stringify(SEED_DEVICES));
    }
}

function saveDevicesData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    } catch (err) {
        console.error('Không thể lưu dữ liệu bảo trì:', err);
    }
}

/* ── 3. RENDER GIAO DIỆN CHÍNH ── */
function renderMaintenanceApp() {
    const container = document.getElementById('devices-list-container');
    if (!container) return;

    // Tính toán thống kê tổng quan
    let totalDevices = devices.length;
    let totalLogs = 0;
    let totalCost = 0;

    const catCounts = { all: totalDevices, vehicle: 0, electronics: 0, appliance: 0, other: 0 };

    devices.forEach(d => {
        const logs = d.logs || [];
        totalLogs += logs.length;
        logs.forEach(l => {
            totalCost += Number(l.cost) || 0;
        });

        const cat = d.category || 'other';
        if (catCounts[cat] !== undefined) {
            catCounts[cat]++;
        } else {
            catCounts.other++;
        }
    });

    // Cập nhật thẻ thống kê
    const devStatEl = document.getElementById('stat-total-devices');
    const costStatEl = document.getElementById('stat-total-cost');
    const logsStatEl = document.getElementById('stat-total-logs');

    if (devStatEl) devStatEl.textContent = `${totalDevices} thiết bị`;
    if (costStatEl) costStatEl.textContent = formatCurrency(totalCost);
    if (logsStatEl) logsStatEl.textContent = `${totalLogs} lượt`;

    // Cập nhật số đếm trên các category tabs
    Object.keys(catCounts).forEach(cat => {
        const countBadge = document.getElementById(`cat-count-${cat}`);
        if (countBadge) countBadge.textContent = catCounts[cat];
    });

    // Lọc theo tìm kiếm và tab danh mục
    const searchInput = document.getElementById('maintenance-search-input');
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const filtered = devices.filter(d => {
        // Lọc danh mục
        if (currentCategory !== 'all' && d.category !== currentCategory) {
            return false;
        }

        // Lọc từ khóa
        if (!keyword) return true;

        const matchName = (d.name || '').toLowerCase().includes(keyword);
        const matchCode = (d.code || '').toLowerCase().includes(keyword);
        const matchNotes = (d.notes || '').toLowerCase().includes(keyword);
        const matchLogs = (d.logs || []).some(l => 
            (l.title || '').toLowerCase().includes(keyword) ||
            (l.location || '').toLowerCase().includes(keyword) ||
            (l.notes || '').toLowerCase().includes(keyword)
        );

        return matchName || matchCode || matchNotes || matchLogs;
    });

    // Nếu không có thiết bị nào
    if (filtered.length === 0) {
        if (keyword) {
            container.innerHTML = `
                <div class="maintenance-empty-state">
                    <div class="empty-icon-wrap">🔍</div>
                    <h3 class="empty-title">Không tìm thấy thiết bị nào</h3>
                    <p class="empty-sub">Không có kết quả khớp với từ khóa "<strong>${escapeHtml(keyword)}</strong>". Thử tìm kiếm với tên hoặc mã khác.</p>
                    <button type="button" class="btn btn-secondary" onclick="clearMaintenanceSearch()">Xóa tìm kiếm</button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="maintenance-empty-state">
                    <div class="empty-icon-wrap">🛠️</div>
                    <h3 class="empty-title">Chưa có thiết bị nào trong danh mục này</h3>
                    <p class="empty-sub">Hãy bấm nút "<strong>+ Thêm thiết bị</strong>" ở trên để ghi nhận xe máy, máy tính, điều hòa hoặc thiết bị cần theo dõi bảo trì.</p>
                    <button type="button" class="btn btn-primary" onclick="openAddDeviceModal()" style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 12px; margin: 0 auto;">
                        <i data-lucide="plus"></i> <span>+ Thêm thiết bị đầu tiên</span>
                    </button>
                </div>
            `;
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
        return;
    }

    // Render danh sách thiết bị
    let html = '';
    filtered.forEach(d => {
        const logs = d.logs || [];
        let devTotalCost = 0;
        let latestLogDate = '--';

        // Sắp xếp logs mới nhất lên đầu
        const sortedLogs = [...logs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        if (sortedLogs.length > 0) {
            latestLogDate = formatDateVN(sortedLogs[0].date);
            devTotalCost = sortedLogs.reduce((acc, l) => acc + (Number(l.cost) || 0), 0);
        }

        const isExpanded = expandedDevices.has(d.id);
        const catName = CATEGORY_NAMES[d.category] || d.category;
        const iconName = CATEGORY_ICONS[d.category] || 'wrench';

        html += `
            <div class="device-card-item" id="device-card-${d.id}">
                <!-- Device Header -->
                <div class="device-card-header">
                    <div class="device-header-left">
                        <div class="device-icon-bubble">
                            <i data-lucide="${iconName}"></i>
                        </div>
                        <div class="device-title-wrap">
                            <div class="device-title-row">
                                <h3 class="device-name">${escapeHtml(d.name)}</h3>
                                <span class="device-cat-pill">${catName}</span>
                            </div>
                            <div class="device-code-sub">
                                ${d.code ? `<span><i data-lucide="tag" style="width:12px;height:12px;display:inline;"></i> ${escapeHtml(d.code)}</span>` : ''}
                                ${d.purchaseDate ? `<span>• Bắt đầu dùng: ${formatDateVN(d.purchaseDate)}</span>` : ''}
                                ${d.odo ? `<span>• Mốc: ${escapeHtml(d.odo)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="device-header-actions">
                        <button type="button" class="btn-card-action btn-edit" onclick="editDevice('${d.id}')" title="Sửa thông tin thiết bị" aria-label="Sửa">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button type="button" class="btn-card-action btn-delete" onclick="promptDeleteDevice('${d.id}')" title="Xóa thiết bị này" aria-label="Xóa">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>

                <!-- Device Card Body -->
                <div class="device-card-body">
                    ${d.notes ? `<p style="font-size: 12.5px; color: #475569; margin: 0 0 10px 0; line-height: 1.45;"><i data-lucide="file-text" style="width:13px;height:13px;display:inline;color:#C2410C;"></i> ${escapeHtml(d.notes)}</p>` : ''}
                    
                    <div class="device-stats-bar">
                        <div class="device-stat-col">
                            <span class="dev-stat-lbl">Tổng chi bảo trì</span>
                            <strong class="dev-stat-val val-highlight">${formatCurrency(devTotalCost)}</strong>
                        </div>
                        <div class="device-stat-col">
                            <span class="dev-stat-lbl">Số lượt bảo dưỡng</span>
                            <strong class="dev-stat-val">${logs.length} lần</strong>
                        </div>
                        <div class="device-stat-col">
                            <span class="dev-stat-lbl">Gần nhất</span>
                            <strong class="dev-stat-val">${latestLogDate}</strong>
                        </div>
                    </div>

                    <div class="device-card-bottom">
                        <button type="button" class="btn-add-log" onclick="openAddLogModal('${d.id}')">
                            <i data-lucide="plus"></i>
                            <span>Thêm lượt bảo trì</span>
                        </button>
                        <button type="button" class="btn-toggle-history ${isExpanded ? 'expanded' : ''}" onclick="toggleDeviceHistory('${d.id}')">
                            <span>Lịch sử sửa chữa (${logs.length})</span>
                            <i data-lucide="chevron-down"></i>
                        </button>
                    </div>
                </div>

                <!-- Accordion Timeline Lịch sử bảo trì -->
                <div class="device-history-section ${isExpanded ? 'open' : ''}" id="history-section-${d.id}">
                    <div class="history-heading">
                        <i data-lucide="history"></i>
                        <span>Chi tiết các lần bảo trì &amp; sửa chữa</span>
                    </div>

                    ${sortedLogs.length === 0 ? `
                        <p style="font-size: 12.5px; color: #94A3B8; text-align: center; padding: 14px 0; margin: 0;">Chưa có lượt sửa chữa nào. Bấm "Thêm lượt bảo trì" để lưu lịch sử mới.</p>
                    ` : `
                        <div class="history-logs-list">
                            ${sortedLogs.map(log => `
                                <div class="log-item-card" id="log-item-${log.id}">
                                    <div class="log-item-left">
                                        <div class="log-date-badge">
                                            <i data-lucide="calendar"></i>
                                            <span>${formatDateVN(log.date)}</span>
                                        </div>
                                        <h4 class="log-title">${escapeHtml(log.title)}</h4>
                                        <div class="log-meta-row">
                                            ${log.location ? `<span class="log-meta-item"><i data-lucide="map-pin"></i> ${escapeHtml(log.location)}</span>` : ''}
                                            ${log.odo ? `<span class="log-meta-item"><i data-lucide="gauge"></i> ${escapeHtml(log.odo)}</span>` : ''}
                                            ${log.notes ? `<span class="log-meta-item"><i data-lucide="info"></i> ${escapeHtml(log.notes)}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="log-item-right">
                                        <strong class="log-cost-amount">${formatCurrency(log.cost)}</strong>
                                        <div class="log-item-actions">
                                            <button type="button" class="btn-log-action" onclick="editLog('${d.id}', '${log.id}')" title="Sửa lượt này" aria-label="Sửa">
                                                <i data-lucide="edit-3"></i>
                                            </button>
                                            <button type="button" class="btn-log-action btn-del" onclick="promptDeleteLog('${d.id}', '${log.id}')" title="Xóa lượt này" aria-label="Xóa">
                                                <i data-lucide="trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

/* ── 4. DEVICE CRUD OPERATIONS ── */
function openAddDeviceModal() {
    document.getElementById('device-id-field').value = '';
    document.getElementById('device-input-name').value = '';
    document.getElementById('device-input-category').value = 'vehicle';
    document.getElementById('device-input-code').value = '';
    document.getElementById('device-input-date').value = '';
    const dateDisplay = document.getElementById('device-input-date-display');
    if (dateDisplay) dateDisplay.value = '';
    document.getElementById('device-input-odo').value = '';
    document.getElementById('device-input-notes').value = '';

    const titleEl = document.getElementById('device-modal-title');
    if (titleEl) titleEl.textContent = 'QUẢN LÝ THIẾT BỊ';
    const subEl = document.getElementById('device-modal-sub');
    if (subEl) subEl.textContent = '';

    const modal = document.getElementById('modal-device');
    if (modal) modal.classList.add('active');
    document.getElementById('device-input-name').focus();
}

function closeDeviceModal() {
    const modal = document.getElementById('modal-device');
    if (modal) modal.classList.remove('active');
}

function editDevice(id) {
    const dev = devices.find(d => d.id === String(id));
    if (!dev) return;

    document.getElementById('device-id-field').value = dev.id;
    document.getElementById('device-input-name').value = dev.name || '';
    document.getElementById('device-input-category').value = dev.category || 'vehicle';
    document.getElementById('device-input-code').value = dev.code || '';
    document.getElementById('device-input-date').value = dev.purchaseDate || '';
    const dateDisplay = document.getElementById('device-input-date-display');
    if (dateDisplay) dateDisplay.value = formatISODateToDMY(dev.purchaseDate);
    document.getElementById('device-input-odo').value = dev.odo || '';
    document.getElementById('device-input-notes').value = dev.notes || '';

    const titleEl = document.getElementById('device-modal-title');
    if (titleEl) titleEl.textContent = 'CHỈNH SỬA THIẾT BỊ';
    const subEl = document.getElementById('device-modal-sub');
    if (subEl) subEl.textContent = '';

    const modal = document.getElementById('modal-device');
    if (modal) modal.classList.add('active');
    document.getElementById('device-input-name').focus();
}

function handleSaveDevice(e) {
    if (e) e.preventDefault();

    const idField = document.getElementById('device-id-field').value;
    const name = document.getElementById('device-input-name').value.trim();
    const category = document.getElementById('device-input-category').value;
    const code = document.getElementById('device-input-code').value.trim();
    let purchaseDate = document.getElementById('device-input-date').value;
    const purchaseDisplay = document.getElementById('device-input-date-display')?.value?.trim();
    if (!purchaseDate && purchaseDisplay) {
        const parsed = parseDMYToISODate(purchaseDisplay);
        if (parsed) {
            purchaseDate = parsed;
            const el = document.getElementById('device-input-date');
            if (el) el.value = parsed;
        }
    }
    const odo = document.getElementById('device-input-odo').value.trim();
    const notes = document.getElementById('device-input-notes').value.trim();

    if (!name) {
        alert('Vui lòng nhập tên thiết bị');
        return;
    }

    if (idField) {
        // Cập nhật thiết bị hiện có
        const idx = devices.findIndex(d => d.id === idField);
        if (idx !== -1) {
            devices[idx].name = name;
            devices[idx].category = category;
            devices[idx].code = code;
            devices[idx].purchaseDate = purchaseDate;
            devices[idx].odo = odo;
            devices[idx].notes = notes;
            devices[idx].updatedAt = new Date().toISOString();
            supabaseUpsertDevice(devices[idx]);
            showToast('Đã cập nhật thiết bị thành công!');
        }
    } else {
        // Thêm thiết bị mới
        const newDevice = {
            id: 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            name: name,
            category: category,
            code: code,
            purchaseDate: purchaseDate,
            odo: odo,
            notes: notes,
            createdAt: new Date().toISOString(),
            logs: []
        };
        devices.unshift(newDevice);
        expandedDevices.add(newDevice.id);
        supabaseUpsertDevice(newDevice);
        showToast('Đã thêm thiết bị mới thành công!');
    }

    saveDevicesData();
    renderMaintenanceApp();
    closeDeviceModal();
}

function promptDeleteDevice(id) {
    const dev = devices.find(d => d.id === String(id));
    if (!dev) return;

    const modal = document.getElementById('modal-confirm-delete');
    const msg = document.getElementById('delete-modal-msg');
    const btn = document.getElementById('btn-confirm-delete-action');

    if (msg) {
        msg.innerHTML = `Bạn có chắc chắn muốn xóa thiết bị <strong>"${escapeHtml(dev.name)}"</strong> cùng toàn bộ lịch sử bảo trì liên quan không?`;
    }

    pendingDeleteAction = () => {
        devices = devices.filter(d => d.id !== String(id));
        expandedDevices.delete(String(id));
        saveDevicesData();
        supabaseDeleteDevice(id);
        renderMaintenanceApp();
        closeDeleteModal();
        showToast('Đã xóa thiết bị thành công!');
    };

    if (btn) btn.onclick = pendingDeleteAction;
    if (modal) modal.classList.add('active');
}

/* ── 5. MAINTENANCE LOG CRUD OPERATIONS ── */
function openAddLogModal(deviceId) {
    const dev = devices.find(d => d.id === String(deviceId));
    if (!dev) return;

    document.getElementById('log-id-field').value = '';
    document.getElementById('log-device-id-field').value = dev.id;
    document.getElementById('log-modal-device-badge').textContent = dev.name;

    document.getElementById('log-input-title').value = '';
    document.getElementById('log-input-cost').value = '';
    // Mặc định ngày hôm nay (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('log-input-date').value = today;
    const dateDisplay = document.getElementById('log-input-date-display');
    if (dateDisplay) dateDisplay.value = formatISODateToDMY(today);
    document.getElementById('log-input-location').value = '';
    document.getElementById('log-input-odo').value = dev.odo || '';
    document.getElementById('log-input-notes').value = '';

    document.getElementById('log-modal-title').textContent = 'Thêm lượt bảo trì';

    const modal = document.getElementById('modal-log');
    if (modal) modal.classList.add('active');
    document.getElementById('log-input-title').focus();
}

function closeLogModal() {
    const modal = document.getElementById('modal-log');
    if (modal) modal.classList.remove('active');
}

function editLog(deviceId, logId) {
    const dev = devices.find(d => d.id === String(deviceId));
    if (!dev) return;
    const log = (dev.logs || []).find(l => l.id === String(logId));
    if (!log) return;

    document.getElementById('log-id-field').value = log.id;
    document.getElementById('log-device-id-field').value = dev.id;
    document.getElementById('log-modal-device-badge').textContent = dev.name;

    document.getElementById('log-input-title').value = log.title || '';
    document.getElementById('log-input-cost').value = (Number(log.cost) || 0).toLocaleString('vi-VN');
    document.getElementById('log-input-date').value = log.date || '';
    const dateDisplay = document.getElementById('log-input-date-display');
    if (dateDisplay) dateDisplay.value = formatISODateToDMY(log.date);
    document.getElementById('log-input-location').value = log.location || '';
    document.getElementById('log-input-odo').value = log.odo || '';
    document.getElementById('log-input-notes').value = log.notes || '';

    document.getElementById('log-modal-title').textContent = 'Chỉnh sửa lượt bảo trì';

    const modal = document.getElementById('modal-log');
    if (modal) modal.classList.add('active');
    document.getElementById('log-input-title').focus();
}

function handleSaveLog(e) {
    if (e) e.preventDefault();

    const logId = document.getElementById('log-id-field').value;
    const deviceId = document.getElementById('log-device-id-field').value;
    const title = document.getElementById('log-input-title').value.trim();
    const cost = parseAmountInput(document.getElementById('log-input-cost').value);
    let date = document.getElementById('log-input-date').value;
    const logDisplay = document.getElementById('log-input-date-display')?.value?.trim();
    if (!date && logDisplay) {
        const parsed = parseDMYToISODate(logDisplay);
        if (parsed) {
            date = parsed;
            const el = document.getElementById('log-input-date');
            if (el) el.value = parsed;
        }
    }
    const location = document.getElementById('log-input-location').value.trim();
    const odo = document.getElementById('log-input-odo').value.trim();
    const notes = document.getElementById('log-input-notes').value.trim();

    if (!title) {
        alert('Vui lòng nhập nội dung sửa chữa / bảo trì');
        return;
    }
    if (!date) {
        alert('Vui lòng chọn ngày sửa chữa');
        return;
    }

    const dev = devices.find(d => d.id === String(deviceId));
    if (!dev) return;

    if (!dev.logs) dev.logs = [];

    if (logId) {
        // Cập nhật lượt bảo trì hiện có
        const idx = dev.logs.findIndex(l => l.id === logId);
        if (idx !== -1) {
            dev.logs[idx].title = title;
            dev.logs[idx].cost = cost;
            dev.logs[idx].date = date;
            dev.logs[idx].location = location;
            dev.logs[idx].odo = odo;
            dev.logs[idx].notes = notes;
            supabaseUpsertLog(dev.logs[idx], dev.id);
            showToast('Đã cập nhật lượt bảo trì thành công!');
        }
    } else {
        // Thêm lượt bảo trì mới
        const newLog = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            deviceId: deviceId,
            title: title,
            cost: cost,
            date: date,
            location: location,
            odo: odo,
            notes: notes,
            createdAt: new Date().toISOString()
        };
        dev.logs.unshift(newLog);
        expandedDevices.add(deviceId);
        supabaseUpsertLog(newLog, dev.id);
        showToast('Đã lưu lượt bảo trì mới!');
    }

    // Nếu người dùng nhập số km mới hơn, cập nhật mốc odo thiết bị
    if (odo) {
        dev.odo = odo;
        supabaseUpsertDevice(dev);
    }

    saveDevicesData();
    renderMaintenanceApp();
    closeLogModal();
}

function promptDeleteLog(deviceId, logId) {
    const dev = devices.find(d => d.id === String(deviceId));
    if (!dev) return;
    const log = (dev.logs || []).find(l => l.id === String(logId));
    if (!log) return;

    const modal = document.getElementById('modal-confirm-delete');
    const msg = document.getElementById('delete-modal-msg');
    const btn = document.getElementById('btn-confirm-delete-action');

    if (msg) {
        msg.innerHTML = `Bạn có chắc chắn muốn xóa lượt bảo trì <strong>"${escapeHtml(log.title)}"</strong> (${formatDateVN(log.date)}) của thiết bị <strong>${escapeHtml(dev.name)}</strong> không?`;
    }

    pendingDeleteAction = () => {
        dev.logs = (dev.logs || []).filter(l => l.id !== String(logId));
        saveDevicesData();
        supabaseDeleteLog(logId);
        renderMaintenanceApp();
        closeDeleteModal();
        showToast('Đã xóa lượt bảo trì!');
    };

    if (btn) btn.onclick = pendingDeleteAction;
    if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
    const modal = document.getElementById('modal-confirm-delete');
    if (modal) modal.classList.remove('active');
    pendingDeleteAction = null;
}

/* ── 6. INTERACTIVE UI HELPERS ── */
function toggleDeviceHistory(deviceId) {
    if (expandedDevices.has(deviceId)) {
        expandedDevices.delete(deviceId);
    } else {
        expandedDevices.add(deviceId);
    }
    renderMaintenanceApp();
}

function selectCategoryFilter(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.cat === cat);
    });
    renderMaintenanceApp();
}

function toggleMaintenanceSearch() {
    const searchBox = document.getElementById('maintenance-search-box');
    const input = document.getElementById('maintenance-search-input');
    if (!searchBox) return;

    if (searchBox.style.display === 'none' || !searchBox.style.display) {
        searchBox.style.display = 'flex';
        if (input) input.focus();
    } else {
        searchBox.style.display = 'none';
        if (input) input.value = '';
        const clearBtn = document.getElementById('maintenance-search-clear');
        if (clearBtn) clearBtn.style.display = 'none';
        renderMaintenanceApp();
    }
}

function filterMaintenanceData() {
    const input = document.getElementById('maintenance-search-input');
    const clearBtn = document.getElementById('maintenance-search-clear');
    if (clearBtn) {
        clearBtn.style.display = input && input.value.trim() ? 'inline-flex' : 'none';
    }
    renderMaintenanceApp();
}

function clearMaintenanceSearch() {
    const input = document.getElementById('maintenance-search-input');
    const clearBtn = document.getElementById('maintenance-search-clear');
    if (input) {
        input.value = '';
        input.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';
    renderMaintenanceApp();
}

function quickFillDeviceName(name, category) {
    const input = document.getElementById('device-input-name');
    const select = document.getElementById('device-input-category');
    if (input) input.value = name;
    if (select && category) select.value = category;
}

function quickFillLogTitle(title) {
    const input = document.getElementById('log-input-title');
    if (input) {
        input.value = title;
        input.focus();
    }
}

function quickFillCost(amount) {
    const input = document.getElementById('log-input-cost');
    if (input) {
        input.value = Number(amount).toLocaleString('vi-VN');
        input.focus();
    }
}

function setLogTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    const input = document.getElementById('log-input-date');
    if (input) input.value = today;
    const dateDisplay = document.getElementById('log-input-date-display');
    if (dateDisplay) dateDisplay.value = formatISODateToDMY(today);
}

/* ── 7. EXPORTS CHO WINDOW ── */
window.goBackToHome = goBackToHome;
window.openAddDeviceModal = openAddDeviceModal;
window.closeDeviceModal = closeDeviceModal;
window.editDevice = editDevice;
window.promptDeleteDevice = promptDeleteDevice;
window.handleSaveDevice = handleSaveDevice;

window.openAddLogModal = openAddLogModal;
window.closeLogModal = closeLogModal;
window.editLog = editLog;
window.promptDeleteLog = promptDeleteLog;
window.handleSaveLog = handleSaveLog;
window.closeDeleteModal = closeDeleteModal;

window.toggleDeviceHistory = toggleDeviceHistory;
window.selectCategoryFilter = selectCategoryFilter;
window.toggleMaintenanceSearch = toggleMaintenanceSearch;
window.filterMaintenanceData = filterMaintenanceData;
window.clearMaintenanceSearch = clearMaintenanceSearch;

window.quickFillDeviceName = quickFillDeviceName;
window.quickFillLogTitle = quickFillLogTitle;
window.quickFillCost = quickFillCost;
window.setLogTodayDate = setLogTodayDate;

/* ── 8. KHỞI TẠO TÍNH NĂNG (START) ── */
export default async function start(user) {
    currentUserId = user?.id || user || null;
    try {
        supabaseClient = getClient();
    } catch (err) {}

    bindCustomDMYPicker('device-input-date', 'device-input-date-display', 'btn-trigger-device-date');
    bindCustomDMYPicker('log-input-date', 'log-input-date-display', 'btn-trigger-log-date');

    loadDevicesData();

    // Định dạng tiền tệ cho ô input chi phí
    const costInput = document.getElementById('log-input-cost');
    if (costInput) formatNumberInput(costInput);

    renderMaintenanceApp();

    if (supabaseClient && currentUserId) {
        await syncMaintenanceFromSupabase();
        renderMaintenanceApp();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}
