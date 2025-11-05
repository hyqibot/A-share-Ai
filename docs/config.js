// Tailscale Funnel URL 配置
// 将 your-random-id.ts.net 替换为你的实际 Tailscale Funnel URL
const API_BASE_URL = 'https://your-random-id.ts.net';

// API 配置
window.API_CONFIG = {
    baseUrl: API_BASE_URL,
    endpoints: {
        performance: '/performance_update',
        tradeHistory: '/api/trade_history',
        performanceHistory: '/api/performance_history',
        currentPositions: '/api/current_positions',
        tradeStatistics: '/api/trade_statistics',
        models: '/api/models',
        aiLog: '/ai_log'
    }
};

