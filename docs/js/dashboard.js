// 从配置获取 API 地址
const API_BASE = window.API_CONFIG.baseUrl;
let performanceChart = null;
let isConnected = false;

// 轮询配置
let pollInterval = 10000; // 默认 10 秒
let errorCount = 0;
const MAX_INTERVAL = 60000; // 最大间隔 60 秒
let pollingTimer = null;

// 初始化图表
function initChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#c9d1d9' } },
                title: { display: false }
            },
            scales: {
                x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
                y: { ticks: { color: '#8b949e', callback: v => '¥' + formatNumber(v) }, grid: { color: '#21262d' } }
            }
        }
    });
}

// 启动轮询
function startPolling() {
    fetchPerformanceData();
}

// 通过 HTTP API 获取性能数据（带指数退避和错误重试）
async function fetchPerformanceData() {
    try {
        const response = await fetch(`${API_BASE}/performance_update`, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            mode: 'cors',
            cache: 'no-store'  // 强制不缓存，确保获取最新实时数据
        });

        if (response.ok) {
            const data = await response.json();
            updatePerformance(data);
            updateChart(data);
            updateStatus('已连接', 'connected');
            
            // 成功时重置
            errorCount = 0;
            pollInterval = 10000;
            isConnected = true;
            
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        errorCount++;
        updateStatus('连接失败', 'disconnected');
        addLog(`❌ 获取数据失败 (${errorCount}次): ${error.message}`, 'error');
        isConnected = false;
        
        // 指数退避：失败时逐渐增加间隔
        pollInterval = Math.min(MAX_INTERVAL, Math.floor(pollInterval * 1.5));
        
        // 连续失败 5 次后暂停轮询 1 分钟
        if (errorCount >= 5) {
            addLog('⏸️ 多次失败，暂停轮询 1 分钟', 'warning');
            if (pollingTimer) {
                clearTimeout(pollingTimer);
                pollingTimer = null;
            }
            setTimeout(() => {
                errorCount = 0;
                pollInterval = 10000;
                fetchPerformanceData();
            }, 60000);
            return;
        }
    }
    
    // 递归调用，使用动态间隔
    pollingTimer = setTimeout(fetchPerformanceData, pollInterval);
}

// 更新性能数据显示
function updatePerformance(data) {
    const grid = document.getElementById('performanceGrid');
    
    if (!data || !data.models) {
        grid.innerHTML = '<div class="loading">暂无数据</div>';
        return;
    }

    let html = '';
    for (const [modelName, modelData] of Object.entries(data.models)) {
        const equity = modelData.total_equity || 0;
        const profit = modelData.total_profit || 0;
        const returnRate = modelData.return_rate || 0;
        
        html += `
            <div class="performance-card">
                <h3>${modelName}</h3>
                <div class="value">¥${formatNumber(equity)}</div>
                <div style="margin-top: 10px; color: ${profit >= 0 ? '#238636' : '#da3633'};">
                    盈亏: ¥${formatNumber(profit)} (${(returnRate * 100).toFixed(2)}%)
                </div>
                <div style="margin-top: 5px; font-size: 12px; color: #8b949e;">
                    持仓: ${modelData.positions_count || 0} 只
                </div>
            </div>
        `;
    }
    
    grid.innerHTML = html || '<div class="loading">暂无数据</div>';
}

// 更新图表
function updateChart(data) {
    if (!performanceChart || !data || !data.models) return;

    const now = new Date().toLocaleTimeString();
    const datasets = [];

    for (const [modelName, modelData] of Object.entries(data.models)) {
        const equity = modelData.total_equity || 0;
        const existingIndex = performanceChart.data.datasets.findIndex(d => d.label === modelName);

        if (existingIndex >= 0) {
            performanceChart.data.datasets[existingIndex].data.push({ x: now, y: equity });
            if (performanceChart.data.datasets[existingIndex].data.length > 50) {
                performanceChart.data.datasets[existingIndex].data.shift();
            }
        } else {
            const color = getRandomColor();
            datasets.push({
                label: modelName,
                data: [{ x: now, y: equity }],
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.4
            });
        }
    }

    if (datasets.length > 0) {
        performanceChart.data.datasets.push(...datasets);
    }

    if (performanceChart.data.labels.length === 0 || performanceChart.data.labels[performanceChart.data.labels.length - 1] !== now) {
        performanceChart.data.labels.push(now);
        if (performanceChart.data.labels.length > 50) {
            performanceChart.data.labels.shift();
        }
    }

    performanceChart.update('none');
}

// 获取随机颜色
function getRandomColor() {
    const colors = ['#58a6ff', '#238636', '#f0883e', '#da3633', '#bc8cff', '#79c0ff'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// 更新连接状态
function updateStatus(text, className) {
    const status = document.getElementById('status');
    status.textContent = text;
    status.className = `status ${className}`;
}

// 添加日志
function addLog(message, level = 'info') {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    
    // 限制日志数量
    if (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

// 格式化数字
function formatNumber(num) {
    return new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', () => {
    addLog('🚀 正在连接服务器...', 'info');
    initChart();
    startPolling();
});

