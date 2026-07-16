const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// دالة ذكية تدخل لصفحة السيرفر وتحاول قنص رابط الـ m3u8 من الأكواد المخفية
async function extractM3u8Link(serverUrl) {
    const config = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': serverUrl
        },
        timeout: 5000 // مهلة 5 ثوانٍ لكل سيرفر
    };

    try {
        // جلب كود HTML الخاص بصفحة السيرفر الـ Embed
        const response = await axios.get(serverUrl, config);
        const html = response.data;

        // بحث متقدم باستخدام Regex عن روابط m3u8 داخل النصوص أو أكواد الجافا سكريبت
        const m3u8Regex = /(https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*)/i;
        const match = html.match(m3u8Regex);

        if (match && match[0]) {
            // تنظيف الرابط من أي فواصل زائدة
            let streamUrl = match[0].replace(/\\/g, ''); 
            return {
                status: "Working",
                m3u8: streamUrl
            };
        }

        // إذا لم يجد الرابط بشكل صريح، قد يكون السيرفر محمي أو مشفر
        return { status: "Protected/Not Found", m3u8: null };

    } catch (error) {
        return { status: "Offline/Error", m3u8: null };
    }
}

app.get('/api/servers', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'يرجى تمرير رابط الصفحة المستهدفة' });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const rawServers = [];

        // 1. استخراج السيرفرات من الصفحة الأساسية
        $('li.Hoverable').each((index, element) => {
            const serverName = $(element).text().trim();
            const serverLink = $(element).attr('data-url');
            if (serverLink) {
                rawServers.push({ name: serverName || `سيرفر #${index + 1}`, url: serverLink });
            }
        });

        if (rawServers.length === 0) {
            $('li[data-url]').each((index, element) => {
                const serverName = $(element).text().trim();
                const serverLink = $(element).attr('data-url');
                if (serverLink) {
                    rawServers.push({ name: serverName || `سيرفر #${index + 1}`, url: serverLink });
                }
            });
        }

        // 2. الفحص والاستخراج المتوازي لروابط m3u8 من داخل كل سيرفر
        const finalServers = await Promise.all(
            rawServers.map(async (server) => {
                const streamData = await extractM3u8Link(server.url);
                return {
                    name: server.name,
                    embed_url: server.url,
                    status: streamData.status,
                    m3u8_url: streamData.m3u8
                };
            })
        );

        res.json({ 
            success: true, 
            count: finalServers.length, 
            data: finalServers 
        });

    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب السيرفرات: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
