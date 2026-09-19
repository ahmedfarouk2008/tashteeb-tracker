import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // مسارات نسبية حتى يعمل الرفع على أي مضيف، حتى داخل مجلد فرعي
  base: './',
  plugins: [
    react(),
    VitePWA({
      // التحديث يُعرض للمستخدم بزر بدل إعادة تحميل مفاجئة أثناء إدخال بيانات
      registerType: 'prompt',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'حاسب التشطيب — إدارة مصاريف تشطيب الشقة',
        short_name: 'حاسب التشطيب',
        description: 'تتبّع مصاريف تشطيب الشقة مع قراءة الفواتير بالذكاء الاصطناعي',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f9',
        theme_color: '#1d61f0',
        icons: [
          { src: './icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // كل أصول التطبيق تُخزَّن مسبقاً ليعمل بالكامل بدون إنترنت
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // حزمة الرسوم البيانية أكبر من الحد الافتراضي (2 م.ب)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // الخطوط العربية: تُخزَّن لتظهر الواجهة بشكلها الصحيح بدون إنترنت
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // نداءات الذكاء الاصطناعي لا تُخزَّن إطلاقاً — نتائجها تتغيّر دائماً
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        // لا نفعّل عامل الخدمة أثناء التطوير حتى لا يخزّن نسخاً قديمة
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // حزمة الرسوم البيانية تُحمَّل عند الطلب (lazy) لذا حجمها لا يؤثر على الإقلاع
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
})
