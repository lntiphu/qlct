/**
 * iSpend Chart Configurations (Using Chart.js with Offline SVG Fallback)
 */

let weeklyChartInstance = null;
let monthlyCategoryChartInstance = null;

// Cấu hình màu sắc phù hợp với hệ thống CSS variables
const CATEGORY_COLORS = {
    "Ăn uống": "#ff9f0a",   // Cam
    "Mua sắm": "#bf5af2",   // Tím
    "Di chuyển": "#0a84ff", // Xanh dương
    "Giải trí": "#ff453a",  // Đỏ
    "Hóa đơn": "#5e5ce6",   // Indigo
    "Khác": "#8e8e93"       // Xám
};

/**
 * Khởi tạo biểu đồ xu hướng tuần (Bar Chart)
 * @param {string} canvasId 
 * @param {Array} labels - Các thứ trong tuần (T2, T3...)
 * @param {Array} data - Số tiền tương ứng
 */
function initWeeklyChart(canvasId, labels, data) {
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    const container = canvasEl.parentElement;

    // KIỂM TRA NẾU KHÔNG CÓ THƯ VIỆN CHART.JS (CHẠY OFFLINE)
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js is not loaded. Using offline SVG fallback for weekly chart.");
        
        // Ẩn canvas
        canvasEl.style.display = 'none';
        
        // Tìm hoặc tạo wrapper cho SVG
        let svgWrapper = container.querySelector('.svg-chart-wrapper');
        if (!svgWrapper) {
            svgWrapper = document.createElement('div');
            svgWrapper.className = 'svg-chart-wrapper';
            svgWrapper.style.width = '100%';
            svgWrapper.style.height = '100%';
            container.appendChild(svgWrapper);
        }
        
        drawSVGWeeklyChart(svgWrapper, labels, data);
        return;
    }

    // Nếu có Chart.js, ẩn SVG wrapper (nếu có) và hiện canvas
    const svgWrapper = container.querySelector('.svg-chart-wrapper');
    if (svgWrapper) svgWrapper.style.display = 'none';
    canvasEl.style.display = 'block';

    const ctx = canvasEl.getContext('2d');
    if (weeklyChartInstance) {
        weeklyChartInstance.destroy();
    }

    weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Chi tiêu',
                data: data,
                backgroundColor: 'rgba(10, 132, 255, 0.85)',
                hoverBackgroundColor: '#0a84ff',
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 16
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ' ' + formatCurrency(context.parsed.y);
                        }
                    },
                    backgroundColor: '#2c2c2e',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawTicks: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: {
                            size: 9,
                            family: 'Plus Jakarta Sans'
                        },
                        callback: function(value) {
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(0) + 'k';
                            }
                            return value;
                        }
                    },
                    border: {
                        dash: [4, 4]
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: {
                            size: 10,
                            weight: '600',
                            family: 'Plus Jakarta Sans'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Khởi tạo biểu đồ phân bố danh mục tháng (Doughnut Chart)
 * @param {string} canvasId 
 * @param {Array} labels - Danh sách các danh mục có chi tiêu
 * @param {Array} data - Số tiền chi tiêu
 */
function initMonthlyCategoryChart(canvasId, labels, data) {
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    const container = canvasEl.parentElement;

    // KIỂM TRA NẾU KHÔNG CÓ THƯ VIỆN CHART.JS (CHẠY OFFLINE)
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js is not loaded. Using offline SVG fallback for monthly chart.");
        
        // Ẩn canvas
        canvasEl.style.display = 'none';
        
        // Tìm hoặc tạo wrapper cho SVG
        let svgWrapper = container.querySelector('.svg-chart-wrapper');
        if (!svgWrapper) {
            svgWrapper = document.createElement('div');
            svgWrapper.className = 'svg-chart-wrapper';
            svgWrapper.style.width = '100%';
            svgWrapper.style.height = '100%';
            svgWrapper.style.display = 'flex';
            svgWrapper.style.justifyContent = 'center';
            svgWrapper.style.alignItems = 'center';
            container.appendChild(svgWrapper);
        } else {
            svgWrapper.style.display = 'flex';
        }
        
        drawSVGDoughnutChart(svgWrapper, labels, data);
        return;
    }

    // Nếu có Chart.js, ẩn SVG wrapper (nếu có) và hiện canvas
    const svgWrapper = container.querySelector('.svg-chart-wrapper');
    if (svgWrapper) svgWrapper.style.display = 'none';
    canvasEl.style.display = 'block';

    const ctx = canvasEl.getContext('2d');
    if (monthlyCategoryChartInstance) {
        monthlyCategoryChartInstance.destroy();
    }

    if (labels.length === 0) {
        labels = ['Chưa có dữ liệu'];
        data = [1];
    }

    const colors = labels.map(label => CATEGORY_COLORS[label] || '#8e8e93');

    monthlyCategoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.label === 'Chưa có dữ liệu') return ' Chưa có dữ liệu';
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const val = context.parsed;
                            const pct = ((val / total) * 100).toFixed(1) + '%';
                            return ` ${context.label}: ${formatCurrency(val)} (${pct})`;
                        }
                    },
                    backgroundColor: '#2c2c2e',
                    padding: 10,
                    cornerRadius: 8
                }
            }
        }
    });
}

/**
 * Vẽ biểu đồ cột tuần bằng SVG (Chạy Offline không cần thư viện)
 */
function drawSVGWeeklyChart(wrapper, labels, data) {
    const width = 330;
    const height = 160;
    const paddingLeft = 32;
    const paddingRight = 8;
    const paddingTop = 20;
    const paddingBottom = 22;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const maxVal = Math.max(...data, 100000); // Tối thiểu 100k
    
    let barsHtml = '';
    let gridLinesHtml = '';
    let xAxisHtml = '';
    let yAxisHtml = '';
    
    // Vẽ đường lưới Y (3 cấp độ)
    const gridLevels = 3;
    for (let i = 0; i <= gridLevels; i++) {
        const yVal = maxVal * (i / gridLevels);
        const yPos = height - paddingBottom - (chartHeight * (i / gridLevels));
        
        let labelText = '';
        if (yVal >= 1000000) labelText = (yVal / 1000000).toFixed(1) + 'M';
        else if (yVal >= 1000) labelText = (yVal / 1000).toFixed(0) + 'k';
        else labelText = yVal.toString();
        
        gridLinesHtml += `<line x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3 3" />`;
        yAxisHtml += `<text x="${paddingLeft - 8}" y="${yPos + 3}" fill="rgba(255,255,255,0.4)" font-size="8" text-anchor="end" font-family="Plus Jakarta Sans">${labelText}</text>`;
    }
    
    const barWidth = 14;
    const gap = (chartWidth - (barWidth * data.length)) / (data.length - 1);
    
    data.forEach((val, index) => {
        const xPos = paddingLeft + index * (barWidth + gap);
        const barHeight = (val / maxVal) * chartHeight;
        const yPos = height - paddingBottom - barHeight;
        
        barsHtml += `
            <g class="svg-bar-group">
                <rect x="${xPos}" y="${yPos}" width="${barWidth}" height="${barHeight}" rx="4" fill="rgba(10, 132, 255, 0.85)" class="svg-bar">
                    <title>${labels[index]}: ${formatCurrency(val)}</title>
                </rect>
                <text x="${xPos + barWidth/2}" y="${yPos - 6}" fill="#fff" font-size="8" text-anchor="middle" font-weight="600" opacity="0" class="svg-bar-label">${val > 0 ? (val/1000).toFixed(0) + 'k' : ''}</text>
            </g>
        `;
        
        xAxisHtml += `<text x="${xPos + barWidth/2}" y="${height - 6}" fill="rgba(255,255,255,0.6)" font-size="9" font-weight="600" text-anchor="middle" font-family="Plus Jakarta Sans">${labels[index]}</text>`;
    });
    
    wrapper.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
            <style>
                .svg-bar { transition: fill 0.2s, height 0.3s, y 0.3s; cursor: pointer; }
                .svg-bar:hover { fill: #0a84ff; }
                .svg-bar-group:hover .svg-bar-label { opacity: 1; }
                .svg-bar-label { transition: opacity 0.2s; font-family: 'Plus Jakarta Sans'; }
            </style>
            ${gridLinesHtml}
            ${yAxisHtml}
            ${barsHtml}
            ${xAxisHtml}
        </svg>
    `;
}

/**
 * Vẽ biểu đồ hình tròn phân bổ tháng bằng SVG (Chạy Offline không cần thư viện)
 */
function drawSVGDoughnutChart(wrapper, labels, data) {
    const width = 200;
    const height = 200;
    const radius = 60;
    const strokeWidth = 16;
    const cx = width / 2;
    const cy = height / 2;
    const circumference = 2 * Math.PI * radius;
    
    let total = data.reduce((a, b) => a + b, 0);
    
    if (total === 0 || labels.length === 0) {
        wrapper.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
                <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.05)" stroke-width="${strokeWidth}" />
                <text x="${cx}" y="${cy + 4}" fill="rgba(255,255,255,0.3)" font-size="11" text-anchor="middle" font-family="Plus Jakarta Sans">Không có dữ liệu chi tiêu</text>
            </svg>
        `;
        return;
    }
    
    let currentOffset = 0;
    let segmentsHtml = '';
    
    labels.forEach((label, index) => {
        const val = data[index];
        const percent = val / total;
        const strokeLength = percent * circumference;
        const strokeOffset = circumference - currentOffset;
        currentOffset += strokeLength;
        
        const color = CATEGORY_COLORS[label] || '#8e8e93';
        
        segmentsHtml += `
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${strokeLength} ${circumference}" 
                    stroke-dashoffset="${-strokeOffset + strokeLength}"
                    transform="rotate(-90 ${cx} ${cy})"
                    style="transition: stroke-width 0.2s; cursor: pointer;">
                <title>${label}: ${formatCurrency(val)} (${(percent*100).toFixed(1)}%)</title>
            </circle>
        `;
    });
    
    // Vẽ phần chữ tổng tiền ở tâm hình tròn
    segmentsHtml += `
        <text x="${cx}" y="${cy - 3}" fill="rgba(255,255,255,0.5)" font-size="9" font-weight="600" text-anchor="middle" font-family="Plus Jakarta Sans" letter-spacing="0.5">TỔNG CHI</text>
        <text x="${cx}" y="${cy + 11}" fill="#ffffff" font-size="12" font-weight="800" text-anchor="middle" font-family="Plus Jakarta Sans">${formatCurrency(total).replace('đ','')}</text>
    `;
    
    wrapper.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
            ${segmentsHtml}
        </svg>
    `;
}

// Hàm hỗ trợ định dạng tiền tệ trong chart
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', 'đ');
}
