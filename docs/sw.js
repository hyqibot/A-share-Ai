// Service Worker 版本号（更新时修改此版本号以强制更新）
const CACHE_VERSION = 'v2.0.1';
const CACHE_NAME = `ai-trader-${CACHE_VERSION}`;

// 需要缓存的静态资源（使用相对路径，适配 GitHub Pages）
const STATIC_ASSETS = [
    './',
    './index.html',
    './portfolio.html',
    './config.js',
    './manifest.json',
    './js/sw-helper.js',
    './js/cache-helper.js',
    // Chart.js 和 Socket.IO 通过 CDN 加载，不需要缓存
];

// 不需要缓存的路径（API 调用，确保实时性）
const NO_CACHE_PATHS = [
    '/api/',
    '/performance_update',
    '/ai_log',
    '.ts.net'  // Tailscale Funnel URL
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] 安装中...', CACHE_NAME);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 缓存静态资源');
                // 缓存静态资源
                return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
                    .catch((error) => {
                        console.warn('[SW] 部分资源缓存失败:', error);
                        // 即使部分失败也继续
                    });
            })
            .then(() => {
                // 安装后立即激活，无需等待用户关闭所有标签页
                return self.skipWaiting();
            })
    );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] 激活中...', CACHE_NAME);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            // 删除旧版本的缓存
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('ai-trader-')) {
                        console.log('[SW] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            // 立即控制所有客户端
            return self.clients.claim();
        })
    );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // 检查是否是不应该缓存的路径
    const shouldNotCache = NO_CACHE_PATHS.some(path => url.href.includes(path));
    
    // API 调用：直接通过网络获取，不使用缓存
    if (shouldNotCache) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // 网络失败时，返回错误信息
                    return new Response(
                        JSON.stringify({ error: '网络连接失败，请检查网络' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // 静态资源：使用缓存优先策略
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // 如果缓存中有，返回缓存
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // 否则从网络获取
                return fetch(event.request)
                    .then((response) => {
                        // 只缓存成功的 GET 请求
                        if (response.status === 200 && event.request.method === 'GET') {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return response;
                    })
                    .catch(() => {
                        // 网络失败且无缓存时，返回离线页面
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html') || caches.match('./');
                        }
                    });
            })
    );
});

// 监听消息（用于手动更新缓存）
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_CLEAR') {
        caches.delete(CACHE_NAME).then(() => {
            event.ports[0].postMessage({ success: true });
        });
    }
});

