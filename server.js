const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.get('/api/servers', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'يرجى تمرير رابط الصفحة المستهدفة' });
    }

    try {
        // إرسال طلب GET مباشر وسريع للموقع الجديد
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const servers = [];

        // استخراج السيرفرات بناءً على الكلاس Hoverable والخاصية data-url
        $('li.Hoverable').each((index, element) => {
            const serverName = $(element).text().trim();
            const serverLink = $(element).attr('data-url');

            if (serverLink) {
                servers.push({
                    name: serverName || `سيرفر #${index + 1}`,
                    url: serverLink
                });
            }
        });

        // خطة بديلة: إذا لم يجد الكلاس Hoverable، يبحث عن أي li يحتوي على الخاصية data-url مباشرة
        if (servers.length === 0) {
            $('li[data-url]').each((index, element) => {
                const serverName = $(element).text().trim();
                const serverLink = $(element).attr('data-url');
                if (serverLink) {
                    servers.push({
                        name: serverName || `سيرفر #${index + 1}`,
                        url: serverLink
                    });
                }
            });
        }

        res.json({ success: true, count: servers.length, data: servers });

    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب السيرفرات: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
