const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// إنشاء نقطة النهاية (Endpoint) لاستخراج السيرفرات
app.get('/api/servers', async (req, res) => {
    const targetUrl = req.query.url;

    // التحقق من وجود الرابط في الطلب
    if (!targetUrl) {
        return res.status(400).json({ 
            status: false, 
            message: 'يرجى تمرير رابط الصفحة، مثال: ?url=https://tv10.egydead.live/...' 
        });
    }

    try {
        // 1. محاكاة النقر على الزر عبر إرسال طلب POST يحتوي على View=1
        const response = await axios.post(targetUrl, 'View=1', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // استخدام User-Agent وهمي لتجنب الحظر
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // 2. تحليل كود HTML الناتج باستخدام Cheerio
        const $ = cheerio.load(response.data);
        const servers = [];

        // 3. استخراج أسماء وروابط السيرفرات من القائمة
        $('ul.serversList li').each((index, element) => {
            const serverName = $(element).find('span p').text().trim();
            const serverLink = $(element).attr('data-link');

            if (serverName && serverLink) {
                servers.push({
                    name: serverName,
                    url: serverLink
                });
            }
        });

        // 4. إرجاع البيانات بصيغة JSON
        res.json({
            status: true,
            count: servers.length,
            data: servers
        });

    } catch (error) {
        res.status(500).json({ 
            status: false, 
            message: 'حدث خطأ أثناء جلب السيرفرات، قد يكون الموقع محمي بـ Cloudflare.', 
            error: error.message 
        });
    }
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API is running on port ${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}/api/servers?url=https://tv10.egydead.live/3096-days-2013-1080p-bluray/`);
});
