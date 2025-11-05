// Service Worker 辅助工具
const SWHelper = {
    // 检查 Service Worker 是否支持
    isSupported() {
        return 'serviceWorker' in navigator;
    },
    
    // 检查是否已注册
    async isRegistered() {
        if (!this.isSupported()) return false;
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
    },
    
    // 强制更新 Service Worker
    async update() {
        if (!this.isSupported()) {
            console.warn('Service Worker 不支持');
            return false;
        }
        
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
            
            // 通知 Service Worker 跳过等待
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            
            console.log('✅ Service Worker 已更新');
            return true;
        } catch (error) {
            console.error('更新 Service Worker 失败:', error);
            return false;
        }
    },
    
    // 清除缓存
    async clearCache() {
        if (!this.isSupported()) return false;
        
        try {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name.startsWith('ai-trader-'))
                    .map(name => caches.delete(name))
            );
            console.log('✅ 缓存已清除');
            return true;
        } catch (error) {
            console.error('清除缓存失败:', error);
            return false;
        }
    },
    
    // 获取缓存信息
    async getCacheInfo() {
        if (!this.isSupported()) return null;
        
        try {
            const cacheNames = await caches.keys();
            const cacheInfo = [];
            
            for (const name of cacheNames.filter(n => n.startsWith('ai-trader-'))) {
                const cache = await caches.open(name);
                const keys = await cache.keys();
                cacheInfo.push({
                    name: name,
                    size: keys.length,
                    keys: keys.map(k => k.url)
                });
            }
            
            return cacheInfo;
        } catch (error) {
            console.error('获取缓存信息失败:', error);
            return null;
        }
    }
};

// 导出到全局
window.SWHelper = SWHelper;

// 在控制台提供快捷命令
console.log('%cService Worker 辅助工具已加载', 'color: #58a6ff; font-weight: bold');
console.log('可用命令:');
console.log('  SWHelper.update()      - 更新 Service Worker');
console.log('  SWHelper.clearCache()  - 清除缓存');
console.log('  SWHelper.getCacheInfo() - 查看缓存信息');

