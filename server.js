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
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        };

        // 1. الخطوة الأولى: دخول الصفحة كزائر عادي لجلب الـ Cookies
        const firstResponse = await axios.get(targetUrl, { headers });
        
        // استخراج الـ Cookies التي أرسلها الموقع
        const cookies = firstResponse.headers['set-cookie'];

        // 2. الخطوة الثانية: إرسال طلب الـ POST (ضغطة الزر) مع الـ Cookies ورابط الإحالة
        const postResponse = await axios.post(targetUrl, 'View=1', {
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': targetUrl, // إخبار الموقع أننا نضغط من نفس الصفحة
                'Cookie': cookies ? cookies.join('; ') : '' // تمرير الكوكيز
            }
        });

        // 3. الخطوة الثالثة: تحليل البيانات واستخراج السيرفرات
        const $ = cheerio.load(postResponse.data);
        const servers = [];

        $('ul.serversList li').each((index, element) => {
            const serverName = $(element).find('span p').text().trim();
            const serverLink = $(element).attr('data-link');

            if (serverName && serverLink) {
                servers.push({ name: serverName, url: serverLink });
            }
        });

        // إذا كانت القائمة فارغة فهذا يعني أن الحماية ما زالت تحظر السيرفر
        if (servers.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'لم يتم العثور على سيرفرات، قد يكون الموقع محمياً بشكل صارم ضد سيرفرات Render.' 
            });
        }

        res.json({ success: true, data: servers });

    } catch (error) {
        res.status(500).json({ error: 'حدث خطأ أثناء الاتصال بالموقع: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
