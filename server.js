require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 300 }); // كاش 5 دقايق

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // تقديم الملفات الثابتة

// ──────────────────────────────────────
// 🛠️ أدوات مساعدة
// ──────────────────────────────────────

// axios instance مع headers مزيفة
const httpClient = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
});

// استخراج security_token
async function getSecurityToken() {
    // تحقق من الكاش أولاً
    const cachedToken = cache.get('security_token');
    if (cachedToken) return cachedToken;

    const sources = [
        'https://www.korax90.co/matches-yesterday',
        'https://cup.shootwithyalla.com/',
        'https://cup.shootwithyalla.com/matches/'
    ];

    for (const url of sources) {
        try {
            const response = await httpClient.get(url);
            const html = response.data;
            
            // أنماط مختلفة لاستخراج التوكن
            const patterns = [
                /security_token=([a-zA-Z0-9]+)/,
                /security_token["']?\s*[:=]\s*["']([a-zA-Z0-9]+)["']/,
                /data-token=["']([a-zA-Z0-9]+)["']/,
                /token:\s*["']([a-zA-Z0-9]+)["']/,
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    const token = match[1];
                    cache.set('security_token', token, 600); // خزن 10 دقايق
                    console.log(`✅ تم استخراج التوكن: ${token} من ${url}`);
                    return token;
                }
            }
        } catch (error) {
            console.log(`⚠️ فشل جلب التوكن من ${url}: ${error.message}`);
        }
    }

    // توكن افتراضي
    const defaultToken = '9eb1d4e57c';
    console.log(`⚠️ استخدام التوكن الافتراضي: ${defaultToken}`);
    return defaultToken;
}

// ──────────────────────────────────────
// 🔌 API Routes
// ──────────────────────────────────────

/**
 * GET /api/matches
 * جلب المباريات من ShootWithYalla
 */
app.get('/api/matches', async (req, res) => {
    try {
        const token = await getSecurityToken();
        const apiUrl = `https://cup.shootwithyalla.com/?action=get_matches&lang=ar&security_token=${token}`;
        
        console.log(`📡 جاري جلب المباريات من: ${apiUrl}`);
        
        const response = await httpClient.get(apiUrl, {
            headers: {
                'Referer': 'https://cup.shootwithyalla.com/',
                'Origin': 'https://cup.shootwithyalla.com',
                'X-Requested-With': 'XMLHttpRequest',
            }
        });

        console.log('✅ تم جلب بيانات المباريات بنجاح');
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ خطأ في جلب المباريات:', error.message);
        res.status(500).json({
            error: 'فشل جلب المباريات',
            message: error.message
        });
    }
});

/**
 * POST /api/extract-m3u8
 * استخراج رابط m3u8 من صفحة السيرفر
 * Body: { url: "https://cup.shootwithyalla.com/albaplayer/sports-1/" }
 */
app.post('/api/extract-m3u8', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إرسال رابط الصفحة' });
    }

    console.log(`🔍 جاري استخراج m3u8 من: ${url}`);

    try {
        // الخطوة 1: جلب صفحة السيرفر
        const pageResponse = await httpClient.get(url, {
            headers: {
                'Referer': 'https://cup.shootwithyalla.com/',
                'Origin': 'https://cup.shootwithyalla.com',
            }
        });

        const html = pageResponse.data;
        const $ = cheerio.load(html);

        // الخطوة 2: البحث عن رابط m3u8 بكل الطرق
        let m3u8Url = null;

        // الطريقة 1: في <video> أو <source> tags
        $('video source, video').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.includes('.m3u8')) {
                m3u8Url = src;
                return false; // break
            }
        });

        // الطريقة 2: في <script> tags
        if (!m3u8Url) {
            $('script').each((i, el) => {
                const scriptContent = $(el).html() || '';
                const patterns = [
                    /(?:source|src|file|url)\s*[=:]\s*["']([^"']*\.m3u8[^"']*)/i,
                    /["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/i,
                    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
                    /player\.source\s*=\s*\{[^}]*src\s*:\s*["']([^"']*\.m3u8[^"']*)/i,
                ];

                for (const pattern of patterns) {
                    const match = scriptContent.match(pattern);
                    if (match) {
                        m3u8Url = match[1];
                        return false; // break
                    }
                }
            });
        }

        // الطريقة 3: في iframe (ندخل جواه)
        if (!m3u8Url) {
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc) {
                console.log(`📎 تم العثور على iframe: ${iframeSrc}`);
                
                const iframeResponse = await httpClient.get(iframeSrc, {
                    headers: {
                        'Referer': url,
                        'Origin': 'https://cup.shootwithyalla.com',
                    }
                });

                const iframeHtml = iframeResponse.data;
                const $$ = cheerio.load(iframeHtml);

                // نفس البحث في الـ iframe
                $$('script').each((i, el) => {
                    const scriptContent = $$(el).html() || '';
                    const m3u8Patterns = [
                        /(?:source|src|file|url)\s*[=:]\s*["']([^"']*\.m3u8[^"']*)/i,
                        /["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/i,
                        /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
                    ];

                    for (const pattern of m3u8Patterns) {
                        const match = scriptContent.match(pattern);
                        if (match) {
                            m3u8Url = match[1];
                            return false;
                        }
                    }
                });
            }
        }

        // الطريقة 4: في أي مكان في الـ HTML
        if (!m3u8Url) {
            const m3u8Patterns = [
                /["'](https?:\/\/[^"']*\.m3u8[^"']*)["']/g,
                /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/g,
            ];

            for (const pattern of m3u8Patterns) {
                const matches = html.match(pattern);
                if (matches) {
                    m3u8Url = matches[0].replace(/^["']|["']$/g, '');
                    break;
                }
            }
        }

        if (m3u8Url) {
            // تنظيف الرابط
            m3u8Url = m3u8Url.replace(/^["']|["']$/g, ''); // إزالة quotes
            if (m3u8Url.startsWith('//')) {
                m3u8Url = 'https:' + m3u8Url;
            }

            console.log(`✅ تم استخراج m3u8: ${m3u8Url}`);
            
            res.json({
                success: true,
                m3u8_url: m3u8Url
            });
        } else {
            throw new Error('لم يتم العثور على رابط m3u8');
        }

    } catch (error) {
        console.error('❌ فشل الاستخراج:', error.message);
        
        // محاولة تشغيل الصفحة كـ iframe كحل بديل
        res.json({
            success: false,
            error: 'لم يتم العثور على رابط مباشر',
            fallback_url: url // يرجع رابط الصفحة الأصلي للتشغيل كـ iframe
        });
    }
});

/**
 * GET /api/extract-m3u8
 * نفس الوظيفة لكن GET (للتوافق مع الكود القديم)
 */
app.get('/api/extract-m3u8', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).json({ error: 'الرجاء إرسال رابط الصفحة' });
    }

    // إعادة توجيه لنفس منطق POST
    req.body = { url };
    return extractM3U8Handler(req, res);
});

// دالة منفصلة للاستخراج
async function extractM3U8Handler(req, res) {
    // نفس كود POST أعلاه... (مختصر للتوضيح)
    // في التنفيذ الكامل، استخدم نفس الكود أو استدعِ الدالة المشتركة
}

// ──────────────────────────────────────
// 🏠 Routes الرئيسية
// ──────────────────────────────────────

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// صفحة المشغل
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// ──────────────────────────────────────
// 🚀 بدء السيرفر
// ──────────────────────────────────────

app.listen(PORT, () => {
    console.log(`
    ⚽━━━━━━━━━━━━━━━━━━━━━━━━━━━⚽
    🎮 سيرفر البث المباشر شغال
    📡 الرابط: http://localhost:${PORT}
    📺 الصفحة الرئيسية: http://localhost:${PORT}/
    ⚽━━━━━━━━━━━━━━━━━━━━━━━━━━━⚽
    `);
});