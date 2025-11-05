// 浏览器缓存辅助工具
// 用于缓存静态配置和减少重复请求

const CacheHelper = {
    // 缓存键前缀
    CACHE_PREFIX: 'ai-trader-',
    
    // 缓存过期时间（毫秒）
    CACHE_EXPIRY: {
        config: 24 * 60 * 60 * 1000,  // 配置：24小时
        models: 60 * 60 * 1000,       // 模型列表：1小时
        tradeHistory: 5 * 60 * 1000   // 交易历史：5分钟
    },
    
    // 设置缓存
    set(key, value, expiry) {
        try {
            const item = {
                value: value,
                expiry: Date.now() + (expiry || this.CACHE_EXPIRY.config),
                timestamp: Date.now()
            };
            localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(item));
        } catch (e) {
            console.warn('缓存设置失败:', e);
        }
    },
    
    // 获取缓存
    get(key) {
        try {
            const itemStr = localStorage.getItem(this.CACHE_PREFIX + key);
            if (!itemStr) return null;
            
            const item = JSON.parse(itemStr);
            
            // 检查是否过期
            if (Date.now() > item.expiry) {
                localStorage.removeItem(this.CACHE_PREFIX + key);
                return null;
            }
            
            return item.value;
        } catch (e) {
            console.warn('缓存读取失败:', e);
            return null;
        }
    },
    
    // 删除缓存
    remove(key) {
        try {
            localStorage.removeItem(this.CACHE_PREFIX + key);
        } catch (e) {
            console.warn('缓存删除失败:', e);
        }
    },
    
    // 清空所有缓存
    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.CACHE_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('清空缓存失败:', e);
        }
    }
};

// 导出到全局
window.CacheHelper = CacheHelper;

