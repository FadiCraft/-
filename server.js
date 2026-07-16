const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.get('/api/servers', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'يرجى تمرير رابط الصفحة' });
    }

    try {
        // محاكاة الضغط على الزر
        const response = await axios.post(targetUrl, 'View=1', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const servers = [];

        // استخراج السيرفرات
        $('ul.serversList li').each((index, element) => {
            const serverName = $(element).find('span p').text().trim();
            const serverLink = $(element).attr('data-link');

            if (serverName && serverLink) {
                servers.push({ name: serverName, url: serverLink });
            }
        });

        res.json({ success: true, data: servers });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// تشغيل السيرفر على البورت الذي تحدده الاستضافة تلقائياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
