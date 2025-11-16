const API_BASE = window.API_CONFIG ? window.API_CONFIG.baseUrl : 'http://localhost:4000';

// SocketIO连接相关变量
let socket = null;
let useSocketIO = false;
let refreshInterval = null;

// 初始化SocketIO连接
function initSocketIO() {
    try {
        if (typeof io !== 'undefined') {
            const SOCKET_URL = API_BASE;
            socket = io(SOCKET_URL, {
                reconnection: true,
                transports: ['websocket', 'polling']
            });
            
            socket.on('connect', function() {
                useSocketIO = true;
                console.log('✅ SocketIO连接成功，portfolio数据将实时推送');
                // SocketIO连接成功后，清除定时刷新
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                    refreshInterval = null;
                }
            });
            
            socket.on('disconnect', function() {
                useSocketIO = false;
                console.log('⚠️ SocketIO连接断开，将使用定时刷新');
                // SocketIO断开后，启用定时刷新
                if (!refreshInterval) {
                    refreshInterval = setInterval(function() {
                        loadData();
                    }, 3600000); // 3600秒 = 1小时
                    console.log('📊 启用定时刷新：每3600秒（1小时）刷新一次');
                }
            });
            
            socket.on('connect_error', function(error) {
                useSocketIO = false;
                console.warn('⚠️ SocketIO连接失败，将使用定时刷新:', error);
                // 连接失败后，启用定时刷新
                if (!refreshInterval) {
                    refreshInterval = setInterval(function() {
                        loadData();
                    }, 3600000); // 3600秒 = 1小时
                    console.log('📊 启用定时刷新：每3600秒（1小时）刷新一次');
                }
            });
            
            // 监听portfolio更新事件
            socket.on('portfolio_update', function(data) {
                console.log('📊 收到portfolio更新推送:', data);
                // 自动刷新数据
                loadData();
            });
        } else {
            console.warn('⚠️ SocketIO库未加载，将使用定时刷新');
        }
    } catch (e) {
        console.warn('⚠️ SocketIO初始化失败，将使用定时刷新:', e);
    }
}

// 加载模型列表（带缓存）
async function loadModels() {
    try {
        // 先检查缓存
        const cachedModels = window.CacheHelper && window.CacheHelper.get('models');
        if (cachedModels) {
            const select = document.getElementById('modelFilter');
            select.innerHTML = '<option value="">所有模型</option>';
            cachedModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                select.appendChild(option);
            });
            return;
        }
        
        // 从 API 获取
        const response = await fetch(`${API_BASE}/api/models`, {
            mode: 'cors',
            cache: 'default'  // 允许浏览器缓存
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();
        
        // 处理返回的数据格式：{status: 'success', data: [{name: '...'}, ...]} 或直接是数组
        let modelList = [];
        if (result && result.status === 'success' && result.data) {
            modelList = result.data.map(m => typeof m === 'string' ? m : m.name);
        } else if (Array.isArray(result)) {
            modelList = result.map(m => typeof m === 'string' ? m : m.name);
        }
        
        // 保存到缓存
        if (window.CacheHelper && modelList.length > 0) {
            window.CacheHelper.set('models', modelList, window.CacheHelper.CACHE_EXPIRY.models);
        }
        
        const select = document.getElementById('modelFilter');
        select.innerHTML = '<option value="">所有模型</option>';
        
        modelList.forEach(modelName => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

// 加载交易历史数据
async function loadData() {
    const model = document.getElementById('modelFilter').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const params = new URLSearchParams();
        if (model) params.append('model_name', model);  // 修正参数名：应该是 model_name
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        params.append('limit', '1000');  // 添加limit参数

        const response = await fetch(`${API_BASE}/api/trade_history?${params}`, {
            mode: 'cors'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const result = await response.json();

        // 处理返回的数据格式：{status: 'success', data: [...]} 或直接是数组
        let data = [];
        if (result && result.status === 'success' && result.data) {
            data = result.data;
        } else if (Array.isArray(result)) {
            data = result;
        } else if (result && result.data && Array.isArray(result.data)) {
            data = result.data;
        }

        if (data && data.length > 0) {
            renderTradeHistory(data);
        } else {
            content.innerHTML = '<div class="loading">暂无交易记录</div>';
        }
    } catch (error) {
        console.error('加载交易历史失败:', error);
        content.innerHTML = `<div class="loading error">加载失败: ${error.message}<br>请检查 config.js 中的 API_BASE_URL 是否正确</div>`;
    }
}

// 渲染交易历史表格
function renderTradeHistory(data) {
    const content = document.getElementById('content');
    let html = `
        <table>
            <thead>
                <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>股票</th>
                    <th>操作</th>
                    <th>数量</th>
                    <th>价格</th>
                    <th>金额</th>
                    <th>置信度</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.forEach(trade => {
        const price = trade.price || trade.fill_price || 0;
        const amount = trade.amount || 0;
        const total = price * amount;
        const confidence = trade.confidence ? (trade.confidence * 100).toFixed(2) + '%' : '-';
        
        html += `
            <tr>
                <td>${trade.executed_at || trade.timestamp || '-'}</td>
                <td>${trade.model_name || '-'}</td>
                <td>${trade.symbol || '-'}</td>
                <td><span class="badge ${trade.action === 'BUY' ? 'buy' : 'sell'}">${trade.action === 'BUY' ? '买入' : '卖出'}</span></td>
                <td>${amount}</td>
                <td>¥${price.toFixed(2)}</td>
                <td>¥${total.toFixed(2)}</td>
                <td>${confidence}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    content.innerHTML = html;
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
    // 初始化SocketIO连接
    initSocketIO();
    
    loadModels();
    loadData();
    
    // 设置默认日期为最近30天
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    
    // 如果SocketIO不可用，启用定时刷新（每3600秒）
    if (!useSocketIO && !refreshInterval) {
        refreshInterval = setInterval(function() {
            loadData();
        }, 3600000); // 3600秒 = 1小时
        console.log('📊 启用定时刷新：每3600秒（1小时）刷新一次');
    }
});

