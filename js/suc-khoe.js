import {onReady, escapeHtml} from './utils.js';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
/*
 * Đồng bộ CKKN với Supabase.
 * Dữ liệu vẫn được giữ trong localStorage để CKKN hoạt động khi offline;
 * khi có phiên đăng nhập Supabase, các thay đổi sẽ được upsert lên health_records.
 */

let healthSupabaseClient = null;
let healthUserId = null;

function healthRecordKey(type, id) {
  return `${type}:${id}`;
}

function cycleToHealthPayload(cycle) {
  return {
    id: cycle.id,
    user_id: healthUserId,
    record_type: 'cycle',
    record_date: cycle.start,
    end_date: cycle.end || null,
    symptoms: Array.isArray(cycle.symptoms) ? cycle.symptoms : [],
    pain: cycle.pain || null,
    mood: Array.isArray(cycle.mood) ? cycle.mood : [],
    note: cycle.note || null
  };
}

function relationToHealthPayload(relation) {
  return {
    id: relation.id,
    user_id: healthUserId,
    record_type: 'relation',
    record_date: relation.date,
    event_time: relation.time || null,
    protection: relation.protection || null,
    methods: Array.isArray(relation.methods) ? relation.methods : [],
    feeling: relation.feeling || null,
    note: relation.note || null
  };
}

function healthRowToCycle(row) {
  return {
    id: row.id,
    start: row.record_date,
    end: row.end_date || '',
    symptoms: Array.isArray(row.symptoms) ? row.symptoms : [],
    pain: row.pain || '',
    mood: Array.isArray(row.mood) ? row.mood : [],
    note: row.note || '',
    createdAt: Date.parse(row.created_at) || Date.now()
  };
}

function healthRowToRelation(row) {
  return {
    id: row.id,
    date: row.record_date,
    time: row.event_time ? String(row.event_time).slice(0, 5) : '',
    protection: row.protection || '',
    methods: Array.isArray(row.methods) ? row.methods : [],
    feeling: row.feeling || '',
    note: row.note || '',
    createdAt: Date.parse(row.created_at) || Date.now()
  };
}

async function syncHealthRecordsFromSupabase() {
  if (!healthSupabaseClient || !healthUserId) return;

  const localCycles = Array.isArray(cycles) ? [...cycles] : [];
  const localRelations = Array.isArray(relations) ? [...relations] : [];
  const { data, error } = await healthSupabaseClient
    .from('health_records')
    .select('*')
    .eq('user_id', healthUserId)
    .order('record_date', { ascending: false });

  if (error) {
    console.error('Không thể tải dữ liệu sức khỏe từ Supabase:', error);
    return;
  }

  const remoteRows = Array.isArray(data) ? data : [];
  const remoteKeys = new Set(remoteRows.map(row => healthRecordKey(row.record_type, row.id)));
  const localRows = [
    ...localCycles.filter(item => !remoteKeys.has(healthRecordKey('cycle', item.id))).map(cycleToHealthPayload),
    ...localRelations.filter(item => !remoteKeys.has(healthRecordKey('relation', item.id))).map(relationToHealthPayload)
  ];

  if (localRows.length) {
    const { error: uploadError } = await healthSupabaseClient
      .from('health_records')
      .upsert(localRows, { onConflict: 'user_id,id' });
    if (uploadError) {
      console.error('Không thể đồng bộ dữ liệu sức khỏe cục bộ:', uploadError);
    } else {
      remoteRows.push(...localRows.map(row => ({
        ...row,
        created_at: new Date().toISOString()
      })));
    }
  }

  cycles = remoteRows.filter(row => row.record_type === 'cycle').map(healthRowToCycle);
  relations = remoteRows.filter(row => row.record_type === 'relation').map(healthRowToRelation);
  localStorage.setItem(CYCLE_KEY, JSON.stringify(cycles));
  localStorage.setItem(RELATION_KEY, JSON.stringify(relations));
}

async function initHealthDatabase() {
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK chưa được tải. CKKN sẽ chỉ lưu cục bộ.');
    return;
  }

  try {
    const clientOwner = window.parent && window.parent !== window ? window.parent : window;
    healthSupabaseClient = clientOwner.__QLCT_SUPABASE_CLIENT || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    clientOwner.__QLCT_SUPABASE_CLIENT = healthSupabaseClient;
    const { data: { session } } = await healthSupabaseClient.auth.getSession();
    healthUserId = session?.user?.id || null;

    if (healthUserId) await syncHealthRecordsFromSupabase();

    healthSupabaseClient.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      if (nextUserId === healthUserId) return;
      healthUserId = nextUserId;
      if (healthUserId) {
        syncHealthRecordsFromSupabase().then(() => {
          renderCycles();
          updateCycleStats();
          updateCyclePredict();
          renderRelations();
          updateRelationStats();
          if (typeof updateRelationSafety === 'function') updateRelationSafety();
        });
      }
    });
  } catch (error) {
    console.error('Không thể khởi tạo kết nối Supabase cho CKKN:', error);
  }
}

function saveHealthRecord(type, record) {
  if (!healthSupabaseClient || !healthUserId || !record) return;
  const payload = type === 'cycle'
    ? cycleToHealthPayload(record)
    : relationToHealthPayload(record);

  healthSupabaseClient
    .from('health_records')
    .upsert([payload], { onConflict: 'user_id,id' })
    .then(({ error }) => {
      if (error) console.error('Không thể lưu dữ liệu sức khỏe:', error);
    });
}

function deleteHealthRecord(type, id) {
  if (!healthSupabaseClient || !healthUserId || !id) return;
  healthSupabaseClient
    .from('health_records')
    .delete()
    .eq('user_id', healthUserId)
    .eq('record_type', type)
    .eq('id', id)
    .then(({ error }) => {
      if (error) console.error('Không thể xóa dữ liệu sức khỏe:', error);
    });
}

/* ══════════════════════════════════════════════════════
   utils.js  –  Các hàm tiện ích dùng chung toàn app
   Không phụ thuộc vào module nào khác.
══════════════════════════════════════════════════════ */

/* ── Storage Keys ── */
const CYCLE_KEY    = 'ckkn_cycles';
const RELATION_KEY = 'ckkn_relations';

const VN_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 (Hà Nội)

function getVietnamDateKey(date = new Date()) {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const shifted = new Date(ms + VN_TIMEZONE_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/* ── Tạo ID ngẫu nhiên duy nhất ── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Tính số ngày chênh lệch giữa 2 chuỗi YYYY-MM-DD ── */
function dayDiff(a, b) {
  const [ya, ma, da] = String(a || '').split('T')[0].split('-').map(Number);
  const [yb, mb, db] = String(b || '').split('T')[0].split('-').map(Number);
  if (![ya, ma, da, yb, mb, db].some(Number.isNaN)) {
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
  }
  return Math.round((new Date(b) - new Date(a)) / 86_400_000);
}

/* ── Cộng thêm d ngày vào date string, trả về string ── */
function addDays(dateStr, d) {
  const [y, m, day] = String(dateStr || '').split('T')[0].split('-').map(Number);
  if (![y, m, day].some(Number.isNaN)) {
    return new Date(Date.UTC(y, m - 1, day + Number(d || 0))).toISOString().slice(0, 10);
  }
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split('T')[0];
}

/* ── Format YYYY-MM-DD → DD/MM/YYYY ── */
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/* ── Tính trung bình mảng số ── */
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/* ── Helpers cho lịch sử nhóm theo tháng ── */
function historyMonthKey(date) {
  return String(date || '').slice(0, 7);
}

function historyMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  return year && month ? `Tháng ${Number(month)} / ${year}` : 'Không xác định ngày';
}

function updateHistoryMonthFilter(selectId, records, dateField) {
  const select = document.getElementById(selectId);
  if (!select) return 'all';

  const current = select.value || 'all';
  const months = [...new Set(
    records.map(record => historyMonthKey(record[dateField])).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  select.innerHTML = '<option value="all">Tất cả tháng</option>' + months
    .map(month => `<option value="${month}">${historyMonthLabel(month)}</option>`)
    .join('');

  select.value = months.includes(current) ? current : 'all';
  return select.value;
}

function groupHistoryByMonth(records, dateField) {
  const groups = new Map();
  records.forEach(record => {
    const month = historyMonthKey(record[dateField]) || 'unknown';
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(record);
  });
  return [...groups.entries()];
}

function normalizeHistoryText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function historyRecordMatchesQuery(record, dateField, query, extraValues = []) {
  const normalizedQuery = normalizeHistoryText(query);
  if (!normalizedQuery) return true;

  const date = String(record[dateField] || '');
  const [year, month, day] = date.split('-');
  const monthNumber = month ? Number(month) : '';
  const dayNumber = day ? Number(day) : '';
  const dateSearchValues = [
    date,
    `${day}/${month}/${year}`,
    `${dayNumber}/${monthNumber}/${year}`,
    `${month}/${year}`,
    `${monthNumber}/${year}`,
    `${month}-${year}`,
    `${monthNumber}-${year}`,
    `${month} ${year}`,
    `${monthNumber} ${year}`,
    `tháng ${monthNumber} ${year}`
  ];

  return normalizeHistoryText([...dateSearchValues, ...extraValues].join(' '))
    .includes(normalizedQuery);
}

/* ── Toast thông báo ── */
let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ══════════════════════════════════════
   Chip helpers  (dùng chung cho cả 2 module)
══════════════════════════════════════ */

/**
 * Sinh chip vào container.
 * @param {string}   containerId  - id phần tử cha
 * @param {string[]} items        - danh sách nhãn
 * @param {string}   color        - class màu (pink | blue | rose | purple | green)
 * @param {Function} onClick      - callback(value)
 */
function buildChips(containerId, items, color, onClick) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Không nhúng callback bằng onclick dạng chuỗi. Callback được truyền từ
  // cycle.js/relation.js và cần giữ lexical scope của module, nếu không các
  // biến như cSelectedSymptoms/cSelectedMood sẽ bị mất trong event handler.
  el.innerHTML = items
    .map(item => {
      const safeValue = String(item)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<span class="chip ${color}" data-val="${safeValue}" role="button" tabindex="0"></span>`;
    })
    .join('');

  el.querySelectorAll('.chip').forEach(chip => {
    const activate = () => onClick(chip.dataset.val);
    chip.textContent = chip.dataset.val;
    chip.addEventListener('click', activate);
    chip.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

/* Đánh dấu 1 chip được chọn (single-select) */
function syncSingleChip(containerId, val) {
  document.querySelectorAll(`#${containerId} .chip`).forEach(c =>
    c.classList.toggle('active', c.dataset.val === val)
  );
}

/* Đánh dấu nhiều chip được chọn (multi-select) */
function syncMultiChip(containerId, setObj) {
  document.querySelectorAll(`#${containerId} .chip`).forEach(c =>
    c.classList.toggle('active', setObj.has(c.dataset.val))
  );
}



/* ══════════════════════════════════════════════════════
   cycle.js  –  Toàn bộ logic Tab "Chu Kỳ Kinh Nguyệt"
   Phụ thuộc: utils.js (phải load trước)
══════════════════════════════════════════════════════ */

/* ── Hằng số dữ liệu ── */
const C_SYMPTOMS = [
  'Đau bụng', 'Đau đầu', 'Mệt mỏi', 'Buồn nôn', 'Chướng bụng',
  'Đau lưng',  'Đau ngực', 'Chóng mặt', 'Tiêu chảy', 'Mụn trứng cá'
];
const C_PAINS = ['Không đau', 'Nhẹ 🟢', 'Vừa 🟡', 'Nặng 🔴', 'Rất nặng 💀'];
const C_MOODS = ['😊 Vui vẻ', '😐 Bình thường', '😢 Buồn', '😠 Cáu kỉnh', '😴 Mệt', '😰 Lo âu', '💪 Năng động'];

/* ── State ── */
let cycles           = JSON.parse(localStorage.getItem(CYCLE_KEY) || '[]');
let cEditId           = null;
let cSelectedSymptoms = new Set();
let cSelectedPain     = '';
let cSelectedMood     = new Set(); // multi-select
let cExpandedHistory  = new Set();
let cHistoryPage      = 0;
const C_HISTORY_PAGE_SIZE = 5;

/* ══════════════════════════════════════
   KHỞI TẠO CHIPS
══════════════════════════════════════ */
function initCycleChips() {
  buildChips('c-symptoms', C_SYMPTOMS, 'pink', v => {
    cSelectedSymptoms.has(v) ? cSelectedSymptoms.delete(v) : cSelectedSymptoms.add(v);
    syncMultiChip('c-symptoms', cSelectedSymptoms);
  });

  buildChips('c-pain', C_PAINS, 'purple', v => {
    cSelectedPain = v;
    syncSingleChip('c-pain', v);
  });

  buildChips('c-mood', C_MOODS, 'pink', v => {
    cSelectedMood.has(v) ? cSelectedMood.delete(v) : cSelectedMood.add(v);
    syncMultiChip('c-mood', cSelectedMood);
  });
}

/* ══════════════════════════════════════
   CRUD – LƯU
══════════════════════════════════════ */
function saveCycle() {
  let start = document.getElementById('c-start')?.value;
  const startDisplay = document.getElementById('c-start-display')?.value?.trim();
  if (!start && startDisplay) {
    const parsed = parseDMYToISODate(startDisplay);
    if (parsed) {
      start = parsed;
      const el = document.getElementById('c-start');
      if (el) el.value = parsed;
    }
  }

  let end = document.getElementById('c-end')?.value;
  const endDisplay = document.getElementById('c-end-display')?.value?.trim();
  if (!end && endDisplay) {
    const parsed = parseDMYToISODate(endDisplay);
    if (parsed) {
      end = parsed;
      const el = document.getElementById('c-end');
      if (el) el.value = parsed;
    }
  }

  const note = (document.getElementById('c-note')?.value || '').trim();

  if (!start) { toast('⚠️ Vui lòng chọn hoặc nhập ngày bắt đầu (dd/mm/yyyy)!'); return; }
  if (end && end < start) { toast('⚠️ Ngày kết thúc phải sau ngày bắt đầu!'); return; }

  const obj = {
    id:        cEditId || uid(),
    start,
    end,
    symptoms:  [...cSelectedSymptoms],
    pain:      cSelectedPain,
    mood:      [...cSelectedMood],
    note,
    createdAt: cEditId
      ? (cycles.find(c => c.id === cEditId)?.createdAt || Date.now())
      : Date.now()
  };

  if (cEditId) {
    cycles[cycles.findIndex(c => c.id === cEditId)] = obj;
    toast('✅ Đã cập nhật chu kỳ!');
  } else {
    cycles.push(obj);
    toast('✅ Đã thêm chu kỳ mới!');
  }

  _saveCycles();
  saveHealthRecord('cycle', obj);
  resetCycleForm();
  if (typeof closeCycleModal === 'function') closeCycleModal();
  cHistoryPage = 0;
  renderCycles();
  updateCycleStats();
  updateCyclePredict();
  if (typeof updateRelationSafety === 'function') updateRelationSafety();
}

/* ══════════════════════════════════════
   CRUD – ĐẶT LẠI FORM
══════════════════════════════════════ */
function resetCycleForm() {
  cEditId = null;
  ['c-start', 'c-end', 'c-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const titleEl = document.getElementById('c-form-title');
  if (titleEl) titleEl.textContent = 'CHU KỲ KINH NGUYỆT';

  cSelectedSymptoms.clear();
  cSelectedPain = '';
  cSelectedMood.clear();

  ['c-symptoms', 'c-pain', 'c-mood'].forEach(id =>
    document.querySelectorAll(`#${id} .chip`).forEach(c => c.classList.remove('active'))
  );
  syncCycleDateDisplay();
}

/* ══════════════════════════════════════
   CRUD – SỬA
══════════════════════════════════════ */
function editCycle(id) {
  const c = cycles.find(x => x.id === id);
  if (!c) return;

  cEditId = id;
  const startEl = document.getElementById('c-start');
  if (startEl) startEl.value = c.start || '';
  const endEl = document.getElementById('c-end');
  if (endEl) endEl.value = c.end || '';
  const noteEl = document.getElementById('c-note');
  if (noteEl) noteEl.value = c.note || '';

  const titleEl = document.getElementById('c-form-title');
  if (titleEl) titleEl.textContent = 'CHỈNH SỬA CHU KỲ';

  syncCycleDateDisplay();

  cSelectedSymptoms = new Set(c.symptoms || []);
  syncMultiChip('c-symptoms', cSelectedSymptoms);

  cSelectedPain = c.pain || '';
  syncSingleChip('c-pain', cSelectedPain);

  cSelectedMood = new Set(Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : []));
  syncMultiChip('c-mood', cSelectedMood);

  switchTab('cycle');
  if (typeof openCycleModal === 'function') openCycleModal(true);
}

/* ══════════════════════════════════════
   RENDER DANH SÁCH
══════════════════════════════════════ */
function getFlowBadgeClass(pain) {
  if (!pain) return 'flow-default';
  const p = String(pain).toLowerCase();
  if (p.includes('nặng') || p.includes('đỏ') || p.includes('heavy') || p.includes('🔴')) return 'flow-heavy';
  if (p.includes('vừa') || p.includes('medium') || p.includes('🟡')) return 'flow-medium';
  if (p.includes('nhẹ') || p.includes('light') || p.includes('🟢')) return 'flow-light';
  if (p.includes('đốm') || p.includes('spot') || p.includes('⚪')) return 'flow-spot';
  return 'flow-default';
}

function renderCycles() {
  const qEl = document.getElementById('c-search');
  const el   = document.getElementById('c-list');
  const paginationEl = document.getElementById('c-history-pagination');
  if (!el) return;
  const q = qEl ? qEl.value : '';

  let list = [...cycles];

  if (q) {
    list = list.filter(c => historyRecordMatchesQuery(c, 'start', q, [
      c.end,
      c.note,
      c.pain,
      ...(Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : [])),
      ...(c.symptoms || [])
    ]));
  }

  list = list
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const totalPages = Math.max(1, Math.ceil(list.length / C_HISTORY_PAGE_SIZE));
  cHistoryPage = Math.min(cHistoryPage, totalPages - 1);

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">🌺</div><p>Không có chu kỳ nào</p></div>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const pageStart = cHistoryPage * C_HISTORY_PAGE_SIZE;
  const pageList = list.slice(pageStart, pageStart + C_HISTORY_PAGE_SIZE);

  el.innerHTML = `<div class="history-groups">${groupHistoryByMonth(pageList, 'start').map(([monthKey, monthRecords]) => `
    <section class="history-month-group">
      <div class="history-month-heading">
        <h3>${historyMonthLabel(monthKey)}</h3>
        <span>${monthRecords.length} bản ghi</span>
      </div>
      <div class="history-month-items">
        ${monthRecords.map(c => {
          const dur = c.end ? dayDiff(c.start, c.end) + 1 : '?';
          const expanded = cExpandedHistory.has(c.id);
          const moods = Array.isArray(c.mood) ? c.mood : (c.mood ? [c.mood] : []);
          const symptoms = c.symptoms || [];
          const painText = c.pain ? (c.pain.startsWith('Không') ? c.pain : `Mức độ đau: ${c.pain}`) : '';
          const subtitle = [
            symptoms.length ? `${symptoms.length} triệu chứng` : 'Chưa ghi triệu chứng',
            painText
          ].filter(Boolean).join(' · ');

          return `
            <article class="history-item cycle-history-item${expanded ? ' is-open' : ''}">
              <button class="history-item-toggle" type="button"
                      onclick="toggleHistoryItem('cycle','${c.id}')"
                      aria-expanded="${expanded}">
                <span class="item-icon">🩸</span>
                <span class="history-item-main">
                  <span class="history-item-title">
                    ${fmtDate(c.start)}${c.end ? ' → ' + fmtDate(c.end) : ''}
                    <span class="badge badge-green">${dur} ngày</span>
                  </span>
                  <span class="history-item-subtitle">${subtitle}</span>
                </span>
                <span class="history-chevron-btn" aria-hidden="true" title="${expanded ? 'Thu gọn' : 'Xem chi tiết'}">
                  <svg class="chevron-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>
              <div class="history-item-details">
                <div class="cycle-details-grid">
                  ${c.pain ? `
                    <div class="cycle-detail-card cycle-pain-card">
                      <div class="cycle-detail-head">
                        <span class="detail-icon-wrap pain-icon">💢</span>
                        <span class="detail-head-title">Mức độ đau</span>
                      </div>
                      <div class="cycle-detail-body">
                        <span class="cycle-flow-pill ${getFlowBadgeClass(c.pain)}">
                          <span class="flow-dot-indicator"></span>
                          <span class="flow-name">${c.pain}</span>
                        </span>
                      </div>
                    </div>
                  ` : ''}

                  ${symptoms.length ? `
                    <div class="cycle-detail-card cycle-symptoms-card">
                      <div class="cycle-detail-head">
                        <span class="detail-icon-wrap symptom-icon">🩺</span>
                        <span class="detail-head-title">Triệu chứng cơ thể <span class="detail-count-badge">${symptoms.length}</span></span>
                      </div>
                      <div class="cycle-detail-body detail-chips-wrap">
                        ${symptoms.map(s => `
                          <span class="cycle-chip chip-symptom">
                            <span class="chip-dot"></span>
                            <span class="chip-text">${s}</span>
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}

                  ${moods.length ? `
                    <div class="cycle-detail-card cycle-moods-card">
                      <div class="cycle-detail-head">
                        <span class="detail-icon-wrap mood-icon">✨</span>
                        <span class="detail-head-title">Cảm xúc & Tâm trạng <span class="detail-count-badge">${moods.length}</span></span>
                      </div>
                      <div class="cycle-detail-body detail-chips-wrap">
                        ${moods.map(m => `
                          <span class="cycle-chip chip-mood">
                            <span class="chip-text">${m}</span>
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}

                  ${c.note ? `
                    <div class="cycle-detail-card cycle-note-card">
                      <div class="cycle-detail-head">
                        <span class="detail-icon-wrap note-icon">💬</span>
                        <span class="detail-head-title">Ghi chú riêng</span>
                      </div>
                      <div class="cycle-detail-body">
                        <p class="cycle-note-content">${escapeHtml(c.note)}</p>
                      </div>
                    </div>
                  ` : ''}

                  ${(!c.pain && !symptoms.length && !moods.length && !c.note) ? `
                    <div class="cycle-detail-empty">
                      <span class="empty-icon">🌱</span>
                      <span>Chưa có thông tin chi tiết được ghi lại cho chu kỳ này</span>
                    </div>
                  ` : ''}
                </div>

                <div class="cycle-item-actions-bar">
                  <div class="actions-bar-info">
                    <span class="info-label">Thời gian:</span>
                    <strong class="info-val">${dur} ngày</strong>
                    ${c.end ? `<span class="info-dates">(${fmtDate(c.start)} → ${fmtDate(c.end)})</span>` : ''}
                  </div>
                  <div class="actions-bar-buttons">
                    <button type="button" class="cycle-action-btn action-edit" onclick="editCycle('${c.id}')" title="Chỉnh sửa chu kỳ">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      <span>Chỉnh sửa</span>
                    </button>
                    <button type="button" class="cycle-action-btn action-del" onclick="askDelete('cycle','${c.id}')" title="Xóa chu kỳ">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;

  if (paginationEl) {
    paginationEl.innerHTML = totalPages > 1 ? `
      <div class="modern-pagination-container">
        <button class="modern-pagi-btn prev-btn" type="button" onclick="changeCycleHistoryPage(-1)" ${cHistoryPage === 0 ? 'disabled' : ''} aria-label="Trang mới hơn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Mới hơn</span>
        </button>

        <div class="modern-pagi-status">
          <span class="pagi-page-current">${cHistoryPage + 1}</span>
          <span class="pagi-page-divider">/</span>
          <span class="pagi-page-total">${totalPages}</span>
        </div>

        <button class="modern-pagi-btn next-btn" type="button" onclick="changeCycleHistoryPage(1)" ${cHistoryPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Trang cũ hơn">
          <span>Cũ hơn</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    ` : `<div class="modern-pagi-single"><span>Hiển thị tất cả ${list.length} chu kỳ</span></div>`;
  }
}

function handleCycleHistorySearch() {
  const input = document.getElementById('c-search');
  const clearBtn = document.getElementById('c-search-clear');
  if (clearBtn && input) {
    clearBtn.style.display = input.value.trim() ? 'inline-flex' : 'none';
  }
  cHistoryPage = 0;
  renderCycles();
}

function clearCycleSearch() {
  const input = document.getElementById('c-search');
  const clearBtn = document.getElementById('c-search-clear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  cHistoryPage = 0;
  renderCycles();
}

function changeCycleHistoryPage(direction) {
  cHistoryPage = Math.max(0, cHistoryPage + direction);
  renderCycles();
}

/* ══════════════════════════════════════
   THỐNG KÊ
══════════════════════════════════════ */
function updateCycleStats() {
  document.getElementById('c-total').textContent = cycles.length;

  if (cycles.length < 2) {
    document.getElementById('c-avg-cycle').textContent = '–';
  } else {
    const sorted = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));
    const diffs  = sorted.slice(1).map((c, i) => dayDiff(sorted[i].start, c.start));
    document.getElementById('c-avg-cycle').textContent = Math.round(avg(diffs));
  }

  const withEnd = cycles.filter(c => c.end);
  document.getElementById('c-avg-dur').textContent = withEnd.length
    ? Math.round(avg(withEnd.map(c => dayDiff(c.start, c.end) + 1)))
    : '–';
}

/* ══════════════════════════════════════
   DỰ ĐOÁN CHU KỲ TIẾP THEO
══════════════════════════════════════ */
function updateCyclePredict() {
  const band = document.getElementById('c-predict');
  if (cycles.length < 2) { band.style.display = 'none'; return; }

  const sorted = [...cycles].sort((a, b) => new Date(a.start) - new Date(b.start));
  const diffs  = sorted.slice(1).map((c, i) => dayDiff(sorted[i].start, c.start));
  const avgCy  = Math.round(avg(diffs));
  const last   = sorted[sorted.length - 1];
  const next   = addDays(last.start, avgCy);

  band.style.display = 'flex';
  document.getElementById('c-predict-text').textContent =
    `Khoảng ${fmtDate(next)} (chu kỳ trung bình ${avgCy} ngày)`;
}

/* ══════════════════════════════════════
   INTERNAL – LƯU VÀO LOCALSTORAGE
══════════════════════════════════════ */
function _saveCycles() {
  localStorage.setItem(CYCLE_KEY, JSON.stringify(cycles));
}

/* ── Xóa một chu kỳ theo id (gọi từ app.js sau khi xác nhận) ── */
function deleteCycleById(id) {
  cycles = cycles.filter(c => c.id !== id);
  cExpandedHistory.delete(id);
  _saveCycles();
  deleteHealthRecord('cycle', id);
  renderCycles();
  updateCycleStats();
  updateCyclePredict();
  if (typeof updateRelationSafety === 'function') updateRelationSafety();
}

/* ══════════════════════════════════════════════════════
   relation.js  –  Toàn bộ logic Tab "Quan Hệ"
   Phụ thuộc: utils.js (phải load trước)
══════════════════════════════════════════════════════ */

/* ── Hằng số dữ liệu ── */
const R_PROT     = ['✅ Có', '❌ Không'];
const R_METHODS  = ['Bao cao su', 'Thuốc tránh thai', 'Vòng tránh thai', 'Tính ngày an toàn', 'Xuất ngoài'];
const R_FEELINGS = ['💖 Tuyệt vời', '😊 Bình thường', '😐 Chấp nhận được', '😰 Lo lắng', '💔 Không tốt'];

/* ── State ── */
let relations        = JSON.parse(localStorage.getItem(RELATION_KEY) || '[]');
let rEditId          = null;
let rSelectedProt    = '';
let rSelectedMethod  = new Set();
let rSelectedFeeling = '';
let rExpandedHistory = new Set();

/* ══════════════════════════════════════
   ƯỚC TÍNH NGÀY ÍT NGUY CƠ HƠN THEO LỊCH
   Đây là phương pháp lịch có vùng đệm bảo thủ, không phải biện pháp
   tránh thai tuyệt đối. Cần khuyến nghị dùng bao cao su/biện pháp phù hợp.
══════════════════════════════════════ */
function _localDateKey(date = new Date()) {
  if (typeof getVietnamDateKey === 'function') {
    return getVietnamDateKey(date);
  }
  const shifted = new Date((date instanceof Date ? date.getTime() : new Date(date).getTime()) + 7 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function _cycleSafetyProfile() {
  if (!Array.isArray(cycles) || cycles.length < 2) return null;

  const sorted = cycles
    .filter(c => c && c.start)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const intervals = sorted.slice(1)
    .map((cycle, index) => dayDiff(sorted[index].start, cycle.start))
    .filter(value => Number.isFinite(value) && value >= 15 && value <= 60);

  if (!intervals.length) return null;

  const durations = sorted
    .filter(c => c.start && c.end && c.end >= c.start)
    .map(c => dayDiff(c.start, c.end) + 1)
    .filter(value => value >= 2 && value <= 10);

  const averageCycle = Math.max(20, Math.min(45, Math.round(avg(intervals))));
  const shortest = Math.min(...intervals);
  const longest = Math.max(...intervals);

  return {
    lastStart: sorted[sorted.length - 1].start,
    averageCycle,
    shortest,
    longest,
    periodLength: durations.length ? Math.max(3, Math.min(8, Math.round(avg(durations)))) : 5
  };
}

function _formatSafetyRange(start, end) {
  return start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`;
}

function _collectSafetyRanges(profile, todayKey, horizon = 42) {
  const firstOffset = Math.max(0, dayDiff(profile.lastStart, todayKey));
  const cycleOffset = Math.floor(firstOffset / profile.averageCycle);
  const anchor = addDays(profile.lastStart, cycleOffset * profile.averageCycle);
  const fertileStart = Math.max(1, profile.shortest - 19);
  const fertileEnd = Math.min(profile.averageCycle, profile.longest - 10);
  const days = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(todayKey, offset);
    const elapsed = Math.max(0, dayDiff(anchor, date));
    const cycleDay = (elapsed % profile.averageCycle) + 1;
    const type = cycleDay <= profile.periodLength
      ? 'period'
      : cycleDay >= fertileStart && cycleDay <= fertileEnd
        ? 'fertile'
        : 'lower-risk';
    days.push({ date, type, cycleDay });
  }

  const rangesFor = type => days.reduce((ranges, day) => {
    const previous = ranges[ranges.length - 1];
    if (day.type === type && previous && addDays(previous.end, 1) === day.date) {
      previous.end = day.date;
    } else if (day.type === type) {
      ranges.push({ start: day.date, end: day.date });
    }
    return ranges;
  }, []);

  return {
    lowerRisk: rangesFor('lower-risk'),
    fertile: rangesFor('fertile'),
    period: rangesFor('period'),
    fertileStart,
    fertileEnd,
    todayCycleDay: days[0]?.cycleDay || 1,
    nextPeriod: addDays(anchor, profile.averageCycle)
  };
}

function updateRelationSafety() {
  const content = document.getElementById('r-safety-content');
  if (!content) return;

  const profile = _cycleSafetyProfile();
  if (!profile) {
    content.innerHTML = `
      <div class="relation-safety-empty">
        <strong>Chưa đủ dữ liệu để ước tính</strong>
        <span>Hãy lưu ít nhất 2 ngày bắt đầu chu kỳ kinh để so sánh độ dài chu kỳ.</span>
      </div>`;
    return;
  }

  const todayKey = _localDateKey();
  const ranges = _collectSafetyRanges(profile, todayKey);
  const lowerRiskText = ranges.lowerRisk.length
    ? ranges.lowerRisk.slice(0, 3).map(range => _formatSafetyRange(range.start, range.end)).join(' · ')
    : 'Không có khoảng phù hợp trong 6 tuần tới';
  const fertileText = ranges.fertile.length
    ? ranges.fertile.slice(0, 3).map(range => _formatSafetyRange(range.start, range.end)).join(' · ')
    : 'Chưa xác định';

  content.innerHTML = `
    <div class="relation-safety-summary">
      <span>Hôm nay là ngày <strong>${ranges.todayCycleDay}</strong> của chu kỳ ước tính <strong>${profile.averageCycle} ngày</strong></span>
      <span>Kỳ tiếp theo dự kiến khoảng <strong>${fmtDate(ranges.nextPeriod)}</strong></span>
    </div>
    <div class="relation-safety-ranges">
      <div class="relation-safety-range lower-risk">
        <span class="relation-safety-label">🟢 Ít nguy cơ hơn theo lịch</span>
        <strong>${lowerRiskText}</strong>
      </div>
      <div class="relation-safety-range fertile">
        <span class="relation-safety-label">🟠 Nên thận trọng hơn</span>
        <strong>${fertileText}</strong>
      </div>
    </div>
    <p class="relation-safety-note">
      Vùng thận trọng được nới rộng theo chu kỳ ngắn nhất/dài nhất đã lưu
      (ngày ${ranges.fertileStart}–${ranges.fertileEnd} của chu kỳ). “Ít nguy cơ hơn” không có nghĩa là an toàn tuyệt đối;
      chu kỳ có thể thay đổi và tinh trùng có thể sống nhiều ngày. Nếu chưa muốn có thai, hãy dùng bao cao su hoặc biện pháp tránh thai phù hợp.
    </p>`;
}

/* ══════════════════════════════════════
   KHỞI TẠO CHIPS
══════════════════════════════════════ */
function initRelationChips() {
  buildChips('r-protection', R_PROT, 'blue', v => {
    rSelectedProt = v;
    syncSingleChip('r-protection', v);
  });

  buildChips('r-method', R_METHODS, 'rose', v => {
    rSelectedMethod.has(v) ? rSelectedMethod.delete(v) : rSelectedMethod.add(v);
    syncMultiChip('r-method', rSelectedMethod);
  });

  buildChips('r-feeling', R_FEELINGS, 'purple', v => {
    rSelectedFeeling = v;
    syncSingleChip('r-feeling', v);
  });
}

/* ══════════════════════════════════════
   HỖ TRỢ ĐỊNH DẠNG NGÀY DD/MM/YYYY
══════════════════════════════════════ */
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

function syncCycleDateDisplay() {
  const startNative = document.getElementById('c-start');
  const startDisplay = document.getElementById('c-start-display');
  if (startNative && startDisplay) {
    startDisplay.value = formatISODateToDMY(startNative.value);
  }
  const endNative = document.getElementById('c-end');
  const endDisplay = document.getElementById('c-end-display');
  if (endNative && endDisplay) {
    endDisplay.value = formatISODateToDMY(endNative.value);
  }
}

function syncRelationDateDisplay() {
  const nativeInput = document.getElementById('r-date');
  const displayInput = document.getElementById('r-date-display');
  if (nativeInput && displayInput) {
    displayInput.value = formatISODateToDMY(nativeInput.value);
  }
}

function bindCycleDatePicker() {
  bindCustomDMYPicker('c-start', 'c-start-display', 'btn-trigger-c-start');
  bindCustomDMYPicker('c-end', 'c-end-display', 'btn-trigger-c-end');
}

function setQuickRelationTime(val) {
  const timeInput = document.getElementById('r-time');
  if (!timeInput) return;
  if (val === 'now') {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${mm}`;
  } else {
    timeInput.value = val;
  }
}

function bindRelationTimeInput() {
  const el = document.getElementById('r-time');
  if (!el) return;

  el.addEventListener('input', (e) => {
    if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
      let v = el.value.replace(/\D/g, '');
      if (v.length > 4) v = v.slice(0, 4);
      if (v.length >= 3) {
        el.value = `${v.slice(0, 2)}:${v.slice(2)}`;
      }
    }
  });

  el.addEventListener('blur', () => {
    let val = el.value.trim();
    if (!val) return;
    const digits = val.replace(/\D/g, '');
    if (digits.length === 1 || digits.length === 2) {
      let h = Math.min(23, Number(digits));
      el.value = `${String(h).padStart(2, '0')}:00`;
    } else if (digits.length === 3) {
      let h = Math.min(23, Number(digits.slice(0, 1)));
      let m = Math.min(59, Number(digits.slice(1)));
      el.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else if (digits.length >= 4) {
      let h = Math.min(23, Number(digits.slice(0, 2)));
      let m = Math.min(59, Number(digits.slice(2, 4)));
      el.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      const match = val.match(/^(\d{1,2}):(\d{1,2})$/);
      if (match) {
        let h = Math.min(23, Number(match[1]));
        let m = Math.min(59, Number(match[2]));
        el.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  });
}

function bindRelationDatePicker() {
  bindCustomDMYPicker('r-date', 'r-date-display', 'btn-trigger-r-date');
  bindRelationTimeInput();
}

/* ══════════════════════════════════════
   CRUD – LƯU
══════════════════════════════════════ */
function saveRelation() {
  let date = document.getElementById('r-date')?.value;
  const displayVal = document.getElementById('r-date-display')?.value?.trim();
  if (!date && displayVal) {
    const parsed = parseDMYToISODate(displayVal);
    if (parsed) {
      date = parsed;
      const dateEl = document.getElementById('r-date');
      if (dateEl) dateEl.value = parsed;
    }
  }
  const time = document.getElementById('r-time')?.value || '';
  const note = (document.getElementById('r-note')?.value || '').trim();

  if (!date) { toast('⚠️ Vui lòng chọn ngày!'); return; }

  const obj = {
    id:         rEditId || uid(),
    date,
    time,
    protection: rSelectedProt,
    methods:    [...rSelectedMethod],
    feeling:    rSelectedFeeling,
    note,
    createdAt:  rEditId
      ? (relations.find(r => r.id === rEditId)?.createdAt || Date.now())
      : Date.now()
  };

  if (rEditId) {
    relations[relations.findIndex(r => r.id === rEditId)] = obj;
    toast('✅ Đã cập nhật!');
  } else {
    relations.push(obj);
    toast('✅ Đã thêm mới!');
  }

   _saveRelations();
   saveHealthRecord('relation', obj);
   resetRelationForm();
   if (typeof closeRelationModal === 'function') closeRelationModal();
   renderRelations();
   updateRelationStats();
   renderRelationCalendar();
   if (relationSelectedDay) {
     showRelationDayDetail(relationSelectedDay);
   }
}

function handleRelationSearch() {
  const input = document.getElementById('r-search');
  const clearBtn = document.getElementById('r-search-clear');
  if (clearBtn && input) {
    clearBtn.style.display = input.value.trim() ? 'inline-flex' : 'none';
  }
  renderRelations();
}

function clearRelationSearch() {
  const input = document.getElementById('r-search');
  const clearBtn = document.getElementById('r-search-clear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  renderRelations();
}

/* ══════════════════════════════════════
   CRUD – ĐẶT LẠI FORM
══════════════════════════════════════ */
function resetRelationForm() {
  rEditId = null;
  ['r-date', 'r-time', 'r-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const titleEl = document.getElementById('r-form-title');
  if (titleEl) titleEl.textContent = 'LẦN QUAN HỆ';
  syncRelationDateDisplay();

  rSelectedProt = '';
  rSelectedMethod.clear();
  rSelectedFeeling = '';

  ['r-protection', 'r-method', 'r-feeling'].forEach(id =>
    document.querySelectorAll(`#${id} .chip`).forEach(c => c.classList.remove('active'))
  );
}

/* ══════════════════════════════════════
   CRUD – SỬA
══════════════════════════════════════ */
function editRelation(id) {
  const r = relations.find(x => x.id === id);
  if (!r) return;

  rEditId = id;
  const dateInput = document.getElementById('r-date');
  if (dateInput) dateInput.value = r.date;
  const timeInput = document.getElementById('r-time');
  if (timeInput) timeInput.value = r.time || '';
  const noteInput = document.getElementById('r-note');
  if (noteInput) noteInput.value = r.note || '';
  const titleEl = document.getElementById('r-form-title');
  if (titleEl) titleEl.textContent = 'CHỈNH SỬA';
  syncRelationDateDisplay();

  rSelectedProt = r.protection || '';
  syncSingleChip('r-protection', rSelectedProt);

  rSelectedMethod = new Set(r.methods || []);
  syncMultiChip('r-method', rSelectedMethod);

  rSelectedFeeling = r.feeling || '';
  syncSingleChip('r-feeling', rSelectedFeeling);

  switchTab('relation');
  if (typeof openRelationModal === 'function') openRelationModal(true);
}

/* ══════════════════════════════════════
   RENDER DANH SÁCH
══════════════════════════════════════ */
function renderRelations() {
  const qEl = document.getElementById('r-search');
  const el   = document.getElementById('r-list');
  if (!el) return;
  const q = qEl ? qEl.value : '';
  const month = updateHistoryMonthFilter('r-month-filter', relations, 'date');

  let list = [...relations];

  if (q) {
    list = list.filter(r => historyRecordMatchesQuery(r, 'date', q, [
      r.time,
      r.note,
      r.protection,
      r.feeling,
      ...(r.methods || [])
    ]));
  }

  if (month !== 'all') {
    list = list.filter(r => historyMonthKey(r.date) === month);
  }

  // Chỉ hiển thị 5 lần quan hệ gần nhất để lịch sử không bị quá dài.
  list = list
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  list.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="ei">💕</div><p>Chưa có dữ liệu quan hệ</p></div>`;
    return;
  }

  el.innerHTML = `<div class="history-groups">${groupHistoryByMonth(list, 'date').map(([monthKey, monthRecords]) => `
    <section class="history-month-group">
      <div class="history-month-heading relation-history-heading">
        <h3>${historyMonthLabel(monthKey)}</h3>
        <span>${monthRecords.length} bản ghi</span>
      </div>
      <div class="history-month-items">
        ${monthRecords.map(r => {
          const expanded = rExpandedHistory.has(r.id);
          const protBadge = r.protection
            ? `<span class="badge ${r.protection.includes('✅') ? 'badge-green' : 'badge-rose'}">${r.protection}</span>`
            : '';
          const methodBadges = (r.methods || [])
            .map(m => `<span class="badge badge-blue">${m}</span>`)
            .join('');
          const feelBadge = r.feeling
            ? `<span class="badge badge-purple">${r.feeling}</span>`
            : '';
          const badges = `${protBadge}${methodBadges}${feelBadge}`;
          const subtitle = [
            r.protection ? r.protection.replace('✅ ', '').replace('❌ ', '') : 'Chưa ghi bảo vệ',
            (r.methods || [])[0] || ''
          ].filter(Boolean).join(' · ');

          return `
            <article class="history-item rose-history-item${expanded ? ' is-open' : ''}">
              <button class="history-item-toggle" type="button"
                      onclick="toggleHistoryItem('relation','${r.id}')"
                      aria-expanded="${expanded}">
                <span class="item-icon rose">💕</span>
                <span class="history-item-main">
                  <span class="history-item-title">${fmtDate(r.date)}${r.time ? ' lúc ' + r.time : ''}</span>
                  <span class="history-item-subtitle">${subtitle}</span>
                </span>
                <span class="history-chevron-btn" aria-hidden="true" title="${expanded ? 'Thu gọn' : 'Xem chi tiết'}">
                  <svg class="chevron-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>
              <div class="history-item-details">
                <div class="item-meta">${badges || '<span class="history-muted">Chưa có thông tin chi tiết</span>'}</div>
                ${r.note ? `<div class="item-note">💬 ${escapeHtml(r.note)}</div>` : ''}
                <div class="cycle-item-actions-bar" style="margin-top:10px;padding-top:10px;">
                  <div class="actions-bar-info">
                    <span class="info-label">Ghi nhận:</span>
                    <strong class="info-val">${fmtDate(r.date)}</strong>
                  </div>
                  <div class="actions-bar-buttons">
                    <button type="button" class="cycle-action-btn action-edit" onclick="editRelation('${r.id}')" title="Sửa">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                      <span>Sửa</span>
                    </button>
                    <button type="button" class="cycle-action-btn action-del" onclick="askDelete('relation','${r.id}')" title="Xóa">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;
}

/* ══════════════════════════════════════
   THỐNG KÊ
══════════════════════════════════════ */
function updateRelationStats() {
  document.getElementById('r-total').textContent = relations.length;

  const todayKey = _localDateKey();
  const currentMonthKey = todayKey.slice(0, 7);
  const thisMonth = relations.filter(r => String(r.date || '').slice(0, 7) === currentMonthKey).length;
  document.getElementById('r-this-month').textContent = thisMonth;

  if (!relations.length) {
    document.getElementById('r-last').textContent = '–';
    return;
  }

  const sorted = [...relations].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const diff   = dayDiff(sorted[0].date, todayKey);

  document.getElementById('r-last').textContent =
    diff === 0 ? 'Hôm nay' : diff === 1 ? 'Hôm qua' : `${diff} ngày`;
}

/* ══════════════════════════════════════
   INTERNAL – LƯU VÀO LOCALSTORAGE
══════════════════════════════════════ */
function _saveRelations() {
  localStorage.setItem(RELATION_KEY, JSON.stringify(relations));
}

/* ── Xóa một bản ghi theo id (gọi từ app.js sau khi xác nhận) ── */
function deleteRelationById(id) {
  relations = relations.filter(r => r.id !== id);
  rExpandedHistory.delete(id);
  _saveRelations();
  deleteHealthRecord('relation', id);
  renderRelations();
  updateRelationStats();
  renderRelationCalendar();
}

/* ══════════════════════════════════════════════════════
   LỊCH QUAN HỆ THEO THÁNG (CHUẨN GIAO DIỆN THU CHI)
   - Điều kiện hiển thị: Có quan hệ thì hiện số lần trong ngày
   - An toàn (có dùng biện pháp): Hiện màu chuẩn cam đất ấm (#FFF7ED, #C2410C)
   - Không an toàn (không dùng biện pháp): Hiện màu đỏ (#FEF2F2, #DC2626)
   - Bấm vào ngày để xem chi tiết giờ, biện pháp, cảm xúc, ghi chú, sửa, xóa
══════════════════════════════════════════════════════ */
let relationCalendarYear = new Date().getFullYear();
let relationCalendarMonth = new Date().getMonth();
let relationSelectedDay = null;

function _syncInitialRelationCalendarMonth() {
  if (Array.isArray(relations) && relations.length > 0) {
    const sorted = [...relations].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const latest = sorted[0]?.date;
    if (latest) {
      const parts = latest.split('-');
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        relationCalendarYear = parseInt(parts[0], 10);
        relationCalendarMonth = parseInt(parts[1], 10) - 1;
      }
    }
  }
}

function getRelationDateParts(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('T')[0].split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { year: parts[0], month: parts[1] - 1, day: parts[2] };
}

function isRelationSafe(r) {
  if (!r) return false;
  const p = String(r.protection || '');
  return p.includes('Có') || p.includes('✅') || p.toLowerCase().includes('co');
}

function renderRelationCalendar() {
  const grid = document.getElementById('r-calendar-days-grid');
  if (!grid) return;

  const yearLabel = document.getElementById('r-calendar-year-label');
  const monthLabel = document.getElementById('r-calendar-month-title');
  const monthTotalEl = document.getElementById('r-calendar-month-total');

  if (yearLabel) yearLabel.textContent = String(relationCalendarYear);
  if (monthLabel) monthLabel.textContent = `Tháng ${relationCalendarMonth + 1}`;

  const daysInMonth = new Date(relationCalendarYear, relationCalendarMonth + 1, 0).getDate();
  const firstDay = new Date(relationCalendarYear, relationCalendarMonth, 1).getDay();
  const firstDayOffset = firstDay === 0 ? 6 : firstDay - 1;

  const dayRelationsMap = {};
  let totalInMonth = 0;

  relations.forEach(r => {
    if (!r || !r.date) return;
    const parts = getRelationDateParts(r.date);
    if (!parts) return;
    if (parts.year === relationCalendarYear && parts.month === relationCalendarMonth) {
      if (!dayRelationsMap[parts.day]) dayRelationsMap[parts.day] = [];
      dayRelationsMap[parts.day].push(r);
      totalInMonth++;
    }
  });

  if (monthTotalEl) {
    monthTotalEl.textContent = `${totalInMonth} lần`;
  }

  grid.innerHTML = '';

  for (let i = 0; i < firstDayOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day-cell empty';
    grid.appendChild(empty);
  }

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayRels = dayRelationsMap[day] || [];
    const count = dayRels.length;
    const dayOfWeek = new Date(Date.UTC(relationCalendarYear, relationCalendarMonth, day)).getUTCDay();
    const isToday = todayYear === relationCalendarYear && todayMonth === relationCalendarMonth && todayDate === day;

    // Phân loại an toàn theo yêu cầu người dùng:
    // 1. Toàn bộ an toàn -> Xanh lá (relation-safe)
    // 2. Toàn bộ không an toàn -> Đỏ (relation-unsafe)
    // 3. Có cả an toàn và không an toàn (vd 2 lần: 1 an toàn, 1 không an toàn) -> Nửa xanh nửa đỏ (relation-mixed)
    let tierClass = '';
    let badgeClass = '';
    if (count > 0) {
      const safeCount = dayRels.filter(r => isRelationSafe(r)).length;
      const unsafeCount = dayRels.filter(r => !isRelationSafe(r)).length;

      if (safeCount > 0 && unsafeCount > 0) {
        tierClass = 'relation-mixed';
        badgeClass = 'badge-mixed';
      } else if (unsafeCount > 0) {
        tierClass = 'relation-unsafe';
        badgeClass = 'badge-unsafe';
      } else {
        tierClass = 'relation-safe';
        badgeClass = 'badge-safe';
      }
    }

    const cell = document.createElement('div');
    cell.className = `calendar-day-cell${isToday ? ' today' : ''}${count > 0 ? ' has-relation ' + tierClass : ''}${dayOfWeek === 0 ? ' sunday' : ''}`;

    const monthStr = String(relationCalendarMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const fullDateStr = `${relationCalendarYear}-${monthStr}-${dayStr}`;

    cell.setAttribute('data-date', fullDateStr);
    cell.onclick = () => showRelationDayDetail(fullDateStr);

    cell.innerHTML = `
      <span class="calendar-day-number">${day}</span>
      ${count > 0 ? `<span class="calendar-day-badge ${badgeClass}">${count} lần</span>` : ''}
    `;

    grid.appendChild(cell);
  }
}

function prevRelationMonth() {
  relationCalendarMonth--;
  if (relationCalendarMonth < 0) {
    relationCalendarMonth = 11;
    relationCalendarYear--;
  }
  renderRelationCalendar();
}

function nextRelationMonth() {
  relationCalendarMonth++;
  if (relationCalendarMonth > 11) {
    relationCalendarMonth = 0;
    relationCalendarYear++;
  }
  renderRelationCalendar();
}

function showRelationDayDetail(dateStr) {
  relationSelectedDay = dateStr;
  const modal = document.getElementById('relation-day-modal');
  if (!modal) return;

  const parts = String(dateStr).split('-');
  let displayTitle = dateStr;
  if (parts.length === 3) {
    const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = dayNames[dObj.getDay()] || '';
    displayTitle = `${dayName}, ngày ${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const titleEl = document.getElementById('r-day-detail-title');
  if (titleEl) titleEl.textContent = displayTitle;

  const dayRels = relations.filter(r => r && r.date === dateStr);
  const count = dayRels.length;

  const countEl = document.getElementById('r-day-summary-count');
  if (countEl) countEl.textContent = `${count} lần`;

  const statusWrap = document.getElementById('r-day-summary-status');
  if (statusWrap) {
    if (count === 0) {
      statusWrap.innerHTML = `<span class="badge-neutral">Chưa có ghi nhận</span>`;
    } else {
      const hasUnsafe = dayRels.some(r => !isRelationSafe(r));
      if (hasUnsafe) {
        statusWrap.innerHTML = `<span class="badge-unsafe-pill">⚠️ Có lần không an toàn</span>`;
      } else {
        statusWrap.innerHTML = `<span class="badge-safe-pill">✅ An toàn</span>`;
      }
    }
  }

  const listEl = document.getElementById('r-day-records-list');
  if (listEl) {
    if (count === 0) {
      listEl.innerHTML = `
        <div class="calendar-day-empty-state">
          <div class="calendar-day-empty-icon">☕</div>
          <div class="calendar-day-empty-title">Không có lần quan hệ nào</div>
          <div class="calendar-day-empty-desc">Chưa ghi nhận hoạt động nào vào ngày này.</div>
        </div>
      `;
    } else {
      listEl.innerHTML = dayRels.map((r, idx) => {
        const isSafe = isRelationSafe(r);
        const protText = r.protection || 'Chưa ghi bảo vệ';
        const methodsText = (r.methods && r.methods.length) ? r.methods.join(', ') : 'Không dùng';
        const feelingText = r.feeling || 'Bình thường';
        const timeText = r.time ? `lúc ${r.time}` : 'Chưa ghi giờ';

        return `
          <div class="relation-day-record-card">
            <div class="record-card-top">
              <div class="record-time-badge">
                <span class="record-num">#${idx + 1}</span>
                <span class="record-time">⏰ ${timeText}</span>
              </div>
              <span class="record-safety-pill ${isSafe ? 'safe' : 'unsafe'}">
                ${isSafe ? '✅ An toàn' : '⚠️ Không an toàn'}
              </span>
            </div>

            <div class="record-detail-grid">
              <div class="record-detail-item">
                <span class="dt-lbl">🛡️ Biện pháp:</span>
                <span class="dt-val">${protText} · ${methodsText}</span>
              </div>
              <div class="record-detail-item">
                <span class="dt-lbl">😊 Cảm xúc:</span>
                <span class="dt-val">${feelingText}</span>
              </div>
              ${r.note ? `
              <div class="record-detail-item full">
                <span class="dt-lbl">📝 Ghi chú:</span>
                <span class="dt-val note-val">${r.note}</span>
              </div>` : ''}
            </div>

            <div class="record-card-actions">
              <button type="button" class="btn-action-edit" onclick="editRelationFromDayModal('${r.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                <span>Chỉnh sửa</span>
              </button>
              <button type="button" class="btn-action-delete" onclick="deleteRelationFromDayModal('${r.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Xóa</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  modal.classList.add('open');
}

function closeRelationDayModal() {
  const modal = document.getElementById('relation-day-modal');
  if (modal) modal.classList.remove('open');
}

function addRelationForSelectedDate() {
  closeRelationDayModal();
  resetRelationForm();
  if (relationSelectedDay) {
    const dateInput = document.getElementById('r-date');
    if (dateInput) dateInput.value = relationSelectedDay;
  }
  syncRelationDateDisplay();
  openRelationModal(false);
}

function editRelationFromDayModal(id) {
  closeRelationDayModal();
  editRelation(id);
}

function deleteRelationFromDayModal(id) {
  askDelete('relation', id);
}

/* ══════════════════════════════════════════════════════
   app.js  –  Điều phối chính: khởi tạo, tab, modal xóa
   Phụ thuộc: utils.js, cycle.js, relation.js
══════════════════════════════════════════════════════ */

/* ── Trạng thái modal xóa ── */
let deleteTarget = null; // { type: 'cycle' | 'relation', id: string }

/* ══════════════════════════════════════
   KHỞI TẠO ỨNG DỤNG
══════════════════════════════════════ */
async function init() {
  // Xây chip cho tab Chu Kỳ
  initCycleChips();
  // Xây chip cho tab Quan Hệ
  initRelationChips();
  // Khởi tạo datepicker định dạng dd/mm/yyyy
  bindCycleDatePicker();
  bindRelationDatePicker();

  // Tải dữ liệu Supabase trước khi vẽ danh sách lần đầu.
  await initHealthDatabase();

  // Đồng bộ tháng lịch quan hệ ban đầu với dữ liệu gần nhất
  _syncInitialRelationCalendarMonth();

  // Render danh sách + thống kê ban đầu
  renderCycles(); // Chu kỳ - Timeline only
  updateCycleStats();
  updateCyclePredict();

  renderRelations();
  updateRelationStats();
  updateRelationSafety();
  renderRelationCalendar();
}

/* ── Mở/đóng chi tiết một bản ghi trong lịch sử ── */
function toggleHistoryItem(type, id) {
  const expandedSet = type === 'cycle' ? cExpandedHistory : rExpandedHistory;
  expandedSet.has(id) ? expandedSet.delete(id) : expandedSet.add(id);

  if (type === 'cycle') renderCycles();
  else renderRelations();
}

/* ══════════════════════════════════════
   CHUYỂN TAB
══════════════════════════════════════ */
function switchTab(tab) {
  const tabs = ['cycle', 'relation'];

  // Cập nhật nút tab
  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    const isTarget = btn.dataset.tab ? btn.dataset.tab === tab : (tabs[i] === tab);
    btn.classList.toggle('active', isTarget);
  });

  // Cập nhật nội dung tab
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle('active', t === tab);
  });
}

/* ══════════════════════════════════════
   MODAL XÁC NHẬN XÓA
══════════════════════════════════════ */

/** Mở modal xóa – gọi từ nút xóa trong từng item */
function askDelete(type, id) {
  deleteTarget = { type, id };
  document.getElementById('del-modal').classList.add('open');
}

/** Xác nhận xóa – gọi từ nút "Xóa" trong modal */
function confirmDelete() {
  if (!deleteTarget) return;

  if (deleteTarget.type === 'cycle') {
    deleteCycleById(deleteTarget.id);
  } else {
    deleteRelationById(deleteTarget.id);
    if (relationSelectedDay) {
      showRelationDayDetail(relationSelectedDay);
    }
  }

  toast('🗑️ Đã xóa!');
  closeModal();
}

/** Đóng modal (hủy xóa) */
function closeModal() {
  document.getElementById('del-modal').classList.remove('open');
  deleteTarget = null;
}

/* ══════════════════════════════════════
   MODAL THÊM MỚI (CHOOSER, CYCLE, RELATION)
══════════════════════════════════════ */
function openAddPickerModal() {
  const modal = document.getElementById('modal-add-picker');
  if (modal) modal.classList.add('open');
}

function closeAddPickerModal() {
  const modal = document.getElementById('modal-add-picker');
  if (modal) modal.classList.remove('open');
}

function selectAddOption(type) {
  closeAddPickerModal();
  if (type === 'cycle') {
    switchTab('cycle');
    resetCycleForm();
    openCycleModal(false);
  } else if (type === 'relation') {
    switchTab('relation');
    resetRelationForm();
    openRelationModal(false);
  }
}

function openCycleModal(isEdit = false) {
  const modal = document.getElementById('modal-cycle');
  if (modal) {
    modal.classList.add('open');
    if (!isEdit) {
      const startEl = document.getElementById('c-start');
      if (startEl && !startEl.value) {
        const today = typeof getVietnamDateKey === 'function'
          ? getVietnamDateKey()
          : new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        startEl.value = today;
      }
      const titleEl = document.getElementById('c-form-title');
      if (titleEl) titleEl.textContent = 'CHU KỲ KINH NGUYỆT';
    } else {
      const titleEl = document.getElementById('c-form-title');
      if (titleEl) titleEl.textContent = 'CHỈNH SỬA CHU KỲ';
    }
    syncCycleDateDisplay();
  }
}

function closeCycleModal() {
  const modal = document.getElementById('modal-cycle');
  if (modal) modal.classList.remove('open');
}

function openRelationModal(isEdit = false) {
  const modal = document.getElementById('modal-relation');
  if (modal) {
    modal.classList.add('open');
    if (!isEdit) {
      const dateEl = document.getElementById('r-date');
      if (dateEl && !dateEl.value) {
        const today = typeof getVietnamDateKey === 'function'
          ? getVietnamDateKey()
          : new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
        dateEl.value = today;
      }
      const titleEl = document.getElementById('r-form-title');
      if (titleEl) titleEl.textContent = 'LẦN QUAN HỆ';
    } else {
      const titleEl = document.getElementById('r-form-title');
      if (titleEl) titleEl.textContent = 'CHỈNH SỬA';
    }
    syncRelationDateDisplay();
  }
}

function closeRelationModal() {
  const modal = document.getElementById('modal-relation');
  if (modal) modal.classList.remove('open');
}

window.openAddPickerModal = openAddPickerModal;
window.closeAddPickerModal = closeAddPickerModal;
window.selectAddOption = selectAddOption;
window.openCycleModal = openCycleModal;
window.closeCycleModal = closeCycleModal;
window.openRelationModal = openRelationModal;
window.closeRelationModal = closeRelationModal;

/* ══════════════════════════════════════
   KHỞI CHẠY KHI DOM SẴN SÀNG
══════════════════════════════════════ */
onReady(init);

// Inline controls on this page and dynamically rendered rows.
Object.assign(window,{
  addRelationForSelectedDate,
  askDelete,
  changeCycleHistoryPage,
  clearCycleSearch,
  clearRelationSearch,
  closeAddPickerModal,
  closeCycleModal,
  closeModal,
  closeRelationDayModal,
  closeRelationModal,
  confirmDelete,
  deleteRelationFromDayModal,
  editCycle,
  editRelation,
  editRelationFromDayModal,
  handleCycleHistorySearch,
  handleRelationSearch,
  nextRelationMonth,
  openAddPickerModal,
  prevRelationMonth,
  renderRelationCalendar,
  renderRelations,
  saveCycle,
  saveRelation,
  selectAddOption,
  setQuickRelationTime,
  showRelationDayDetail,
  switchTab,
  toggleHistoryItem
});

export default function start() {}
