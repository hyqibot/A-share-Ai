const API_BASE = window.API_CONFIG.baseUrl;

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
        
        const models = await response.json();
        
        // 保存到缓存
        if (window.CacheHelper) {
            window.CacheHelper.set('models', models, window.CacheHelper.CACHE_EXPIRY.models);
        }
        
        const select = document.getElementById('modelFilter');
        select.innerHTML = '<option value="">所有模型</option>';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
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
        if (model) params.append('model', model);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const response = await fetch(`${API_BASE}/api/trade_history?${params}`, {
            mode: 'cors'
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();

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
    loadModels();
    loadData();
    
    // 设置默认日期为最近30天
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
});

