import {onReady} from './utils.js';
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
  const start = document.getElementById('c-start').value;
  const end   = document.getElementById('c-end').value;
  const note  = document.getElementById('c-note').value.trim();

  if (!start) { toast('⚠️ Vui lòng chọn ngày bắt đầu!'); return; }
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
  ['c-start', 'c-end', 'c-note'].forEach(id => (document.getElementById(id).value = ''));
  document.getElementById('c-form-title').textContent = 'Thêm Chu Kỳ Mới';

  cSelectedSymptoms.clear();
  cSelectedPain = '';
  cSelectedMood.clear();

  ['c-symptoms', 'c-pain', 'c-mood'].forEach(id =>
    document.querySelectorAll(`#${id} .chip`).forEach(c => c.classList.remove('active'))
  );
}

/* ══════════════════════════════════════
   CRUD – SỬA
══════════════════════════════════════ */
function editCycle(id) {
  const c = cycles.find(x => x.id === id);
  if (!c) return;

  cEditId = id;
  document.getElementById('c-start').value = c.start;
  document.getElementById('c-end').value   = c.end || '';
  document.getElementById('c-note').value  = c.note || '';
  document.getElementById('c-form-title').textContent = 'Chỉnh Sửa Chu Kỳ';

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
          const badges = [
            ...symptoms.map(s => `<span class="badge badge-pink">${s}</span>`),
            c.pain ? `<span class="badge badge-purple">${c.pain}</span>` : '',
            ...moods.map(m => `<span class="badge badge-blue">${m}</span>`)
          ].filter(Boolean).join('');
          const subtitle = [
            symptoms.length ? `${symptoms.length} triệu chứng` : 'Chưa ghi triệu chứng',
            c.pain || ''
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
                <span class="history-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="history-item-details">
                <div class="item-meta">${badges || '<span class="history-muted">Chưa có thông tin chi tiết</span>'}</div>
                ${c.note ? `<div class="item-note">💬 ${c.note}</div>` : ''}
                <div class="history-item-actions">
                  <button class="icon-btn edit" onclick="editCycle('${c.id}')" title="Sửa">✏️</button>
                  <button class="icon-btn del" onclick="askDelete('cycle','${c.id}')" title="Xóa">🗑️</button>
                </div>
              </div>
            </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;

  if (paginationEl) {
    paginationEl.innerHTML = totalPages > 1 ? `
      <button class="history-page-btn" type="button" onclick="changeCycleHistoryPage(-1)" ${cHistoryPage === 0 ? 'disabled' : ''}>← Mới hơn</button>
      <span>Trang ${cHistoryPage + 1} / ${totalPages}</span>
      <button class="history-page-btn" type="button" onclick="changeCycleHistoryPage(1)" ${cHistoryPage >= totalPages - 1 ? 'disabled' : ''}>Cũ hơn →</button>
    ` : `<span>Đang hiển thị ${list.length} bản ghi gần nhất</span>`;
  }
}

function handleCycleHistorySearch() {
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
   CRUD – LƯU
══════════════════════════════════════ */
function saveRelation() {
  const date = document.getElementById('r-date').value;
  const time = document.getElementById('r-time').value;
  const note = document.getElementById('r-note').value.trim();

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
}

/* ══════════════════════════════════════
   CRUD – ĐẶT LẠI FORM
══════════════════════════════════════ */
function resetRelationForm() {
  rEditId = null;
  ['r-date', 'r-time', 'r-note'].forEach(id => (document.getElementById(id).value = ''));
  document.getElementById('r-form-title').textContent = 'Thêm Lần Quan Hệ';

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
  document.getElementById('r-date').value = r.date;
  document.getElementById('r-time').value = r.time || '';
  document.getElementById('r-note').value = r.note || '';
  document.getElementById('r-form-title').textContent = 'Chỉnh Sửa';

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
    el.innerHTML = `<div class="empty"><div class="ei">💞</div><p>Chưa có dữ liệu quan hệ</p></div>`;
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
                <span class="item-icon rose">💞</span>
                <span class="history-item-main">
                  <span class="history-item-title">${fmtDate(r.date)}${r.time ? ' lúc ' + r.time : ''}</span>
                  <span class="history-item-subtitle">${subtitle}</span>
                </span>
                <span class="history-chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="history-item-details">
                <div class="item-meta">${badges || '<span class="history-muted">Chưa có thông tin chi tiết</span>'}</div>
                ${r.note ? `<div class="item-note">💬 ${r.note}</div>` : ''}
                <div class="history-item-actions">
                  <button class="icon-btn edit" onclick="editRelation('${r.id}')" title="Sửa">✏️</button>
                  <button class="icon-btn del" onclick="askDelete('relation','${r.id}')" title="Xóa">🗑️</button>
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

  // Tải dữ liệu Supabase trước khi vẽ danh sách lần đầu.
  await initHealthDatabase();

  // Render danh sách + thống kê ban đầu
  renderCycles(); // Chu kỳ - Timeline only
  updateCycleStats();
  updateCyclePredict();

  renderRelations();
  updateRelationStats();
  updateRelationSafety();
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
    }
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
    }
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
Object.assign(window,{askDelete,changeCycleHistoryPage,closeAddPickerModal,closeCycleModal,closeModal,closeRelationModal,confirmDelete,editCycle,editRelation,handleCycleHistorySearch,openAddPickerModal,renderRelations,saveCycle,saveRelation,selectAddOption,switchTab,toggleHistoryItem});

export default function start() {}
