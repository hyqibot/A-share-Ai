const API_BASE = window.API_CONFIG ? window.API_CONFIG.baseUrl : 'http://localhost:4000';
const HISTORY_ENDPOINT = (window.API_CONFIG && window.API_CONFIG.endpoints && window.API_CONFIG.endpoints.performanceHistory)
    ? window.API_CONFIG.endpoints.performanceHistory
    : '/api/performance_history';
const MODELS_ENDPOINT = (window.API_CONFIG && window.API_CONFIG.endpoints && window.API_CONFIG.endpoints.models)
    ? window.API_CONFIG.endpoints.models
    : '/api/models';

const CHART_COLORS = ['#58a6ff', '#3fb950', '#f85149', '#d29922', '#a371f7', '#db6d28'];

let historyChart = null;

function formatNumber(num, digits) {
    const value = Number(num);
    if (!Number.isFinite(value)) return '-';
    return value.toLocaleString('zh-CN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatPercent(num) {
    const value = Number(num);
    if (!Number.isFinite(value)) return '-';
    const sign = value > 0 ? '+' : '';
    return sign + value.toFixed(2) + '%';
}

async function loadModels() {
    const select = document.getElementById('modelFilter');
    if (!select) return;
    try {
        const response = await fetch(`${API_BASE}${MODELS_ENDPOINT}`, { mode: 'cors', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        let modelList = [];
        if (result && result.status === 'success' && Array.isArray(result.data)) {
            modelList = result.data.map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean);
        } else if (Array.isArray(result)) {
            modelList = result.map(item => (typeof item === 'string' ? item : item.name)).filter(Boolean);
        }
        const current = select.value;
        select.innerHTML = '<option value="">全部模型</option>';
        modelList.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        if (current) select.value = current;
    } catch (error) {
        console.warn('加载模型列表失败:', error);
    }
}

function setStatus(text, kind) {
    const el = document.getElementById('historyStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-text' + (kind ? ' ' + kind : '');
}

function emptyChart(message) {
    const canvas = document.getElementById('historyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (historyChart) {
        historyChart.destroy();
        historyChart = null;
    }
    historyChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: message || '暂无历史收益数据', color: '#8b949e', font: { size: 16 } }
            }
        }
    });
}

function renderChart(series) {
    const canvas = document.getElementById('historyChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const modelNames = Object.keys(series || {});
    if (!modelNames.length) {
        emptyChart('暂无历史收益数据');
        return;
    }

    const dateSet = new Set();
    modelNames.forEach(name => {
        (series[name] || []).forEach(point => {
            if (point && point.date) dateSet.add(point.date);
        });
    });
    const labels = Array.from(dateSet).sort();
    const datasets = modelNames.map((name, index) => {
        const byDate = {};
        (series[name] || []).forEach(point => {
            if (point && point.date) byDate[point.date] = Number(point.profit) || 0;
        });
        return {
            label: name,
            data: labels.map(date => (Object.prototype.hasOwnProperty.call(byDate, date) ? byDate[date] : null)),
            borderColor: CHART_COLORS[index % CHART_COLORS.length],
            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true,
            tension: 0.15
        };
    });

    const ctx = canvas.getContext('2d');
    if (historyChart) {
        historyChart.destroy();
    }
    historyChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: '#c9d1d9', usePointStyle: true, padding: 16 }
                },
                title: {
                    display: true,
                    text: 'AI模型日级历史收益率',
                    color: '#f0f6fc',
                    font: { size: 18, weight: '600' },
                    padding: { bottom: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed.y;
                            if (value == null) return context.dataset.label + ': -';
                            return context.dataset.label + ': ' + formatPercent(value);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8b949e', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                    grid: { color: '#21262d' },
                    title: { display: true, text: '日期', color: '#8b949e' }
                },
                y: {
                    ticks: {
                        color: '#8b949e',
                        callback: function (value) { return formatPercent(value); }
                    },
                    grid: { color: '#21262d' },
                    title: { display: true, text: '累计收益率 (%)', color: '#8b949e' }
                }
            }
        }
    });
}

function renderSummary(series) {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    const modelNames = Object.keys(series || {});
    if (!modelNames.length) {
        grid.innerHTML = '';
        return;
    }
    grid.innerHTML = modelNames.map(name => {
        const points = series[name] || [];
        const latest = points.length ? points[points.length - 1] : null;
        const profit = latest ? latest.profit : 0;
        const cls = profit >= 0 ? 'positive' : 'negative';
        return `
            <div class="stat-card">
                <div class="label">${name}</div>
                <div class="value ${cls}">${formatPercent(profit)}</div>
                <div class="meta">${points.length} 个交易日${latest && latest.date ? ' · 最新 ' + latest.date : ''}</div>
            </div>
        `;
    }).join('');
}

function renderTable(records) {
    const body = document.getElementById('historyBody');
    if (!body) return;
    if (!records || !records.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty">暂无历史收益数据。每轮交易结束后会写入 logs/trades.db</td></tr>';
        return;
    }
    const sorted = records.slice().sort((a, b) => {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(a.model_name || '').localeCompare(String(b.model_name || ''));
    });
    body.innerHTML = sorted.map(row => {
        const profit = Number(row.return_rate) || 0;
        const cls = profit >= 0 ? 'positive' : 'negative';
        return `
            <tr>
                <td>${row.date || '-'}</td>
                <td>${row.model_name || '-'}</td>
                <td class="text-right ${cls}">${formatPercent(profit)}</td>
                <td class="text-right">¥${formatNumber(row.total_equity, 2)}</td>
                <td class="text-right">¥${formatNumber(row.total_profit, 2)}</td>
                <td class="text-right">${row.total_trades == null ? '-' : row.total_trades}</td>
                <td class="text-right">${row.positions_count == null ? '-' : row.positions_count}</td>
                <td class="text-right">¥${formatNumber(row.available_cash, 2)}</td>
            </tr>
        `;
    }).join('');
}

async function loadHistory() {
    const model = (document.getElementById('modelFilter') || {}).value || '';
    const startDate = (document.getElementById('startDate') || {}).value || '';
    const endDate = (document.getElementById('endDate') || {}).value || '';
    const params = new URLSearchParams();
    if (model) params.append('model_name', model);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    setStatus('正在加载日级历史收益...', '');
    const body = document.getElementById('historyBody');
    if (body) {
        body.innerHTML = '<tr><td colspan="8" class="loading">正在加载数据...</td></tr>';
    }

    try {
        const url = `${API_BASE}${HISTORY_ENDPOINT}${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result && result.status === 'error') {
            throw new Error(result.message || '接口返回错误');
        }
        const records = (result && result.data) || [];
        const series = (result && result.series) || {};
        const modelCount = Object.keys(series).length;
        const pointCount = Object.values(series).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);

        renderChart(series);
        renderSummary(series);
        renderTable(records);

        if (!modelCount) {
            setStatus('暂无历史数据（可先运行几轮交易）', 'warn');
        } else {
            setStatus(`已加载 ${modelCount} 个模型、共 ${pointCount} 个日级数据点（logs/trades.db）`, 'ok');
        }
    } catch (error) {
        console.error('加载日级历史收益失败:', error);
        emptyChart('加载失败');
        renderSummary({});
        if (body) {
            body.innerHTML = `<tr><td colspan="8" class="error">加载失败: ${error.message}<br>请确认交易程序已启动，且 config.js 中的 API_BASE_URL 可访问</td></tr>`;
        }
        setStatus('加载失败: ' + error.message, 'error');
    }
}

function resetFilters() {
    const model = document.getElementById('modelFilter');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    if (model) model.value = '';
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    loadHistory();
}

window.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadHistory();
});
