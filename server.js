const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

app.get('/api/servers', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'يرجى تمرير رابط الصفحة' });
    }

    let browser;
    try {
        // تشغيل المتصفح مع إعدادات تخطي الحماية والتوافق مع استضافة Render
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });

        const page = await browser.newPage();
        
        // تزويد المتصفح بهوية مستخدم حقيقي تماماً
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. الدخول إلى صفحة الفيلم والانتظار حتى تحميل الشبكة
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. الانتظار حتى يظهر زر "المشاهدة والتحميل" في الصفحة
        await page.waitForSelector('.watchNow button', { timeout: 15000 });

        // 3. محاكاة نقرة حقيقية على الزر
        await page.click('.watchNow button');

        // 4. الانتظار حتى تظهر قائمة السيرفرات (ul.serversList) وتتحمل بالكامل
        await page.waitForSelector('ul.serversList li', { timeout: 20000 });

        // 5. استخراج أسماء وروابط السيرفرات من كود الصفحة المتغير
        const servers = await page.evaluate(() => {
            const list = [];
            const elements = document.querySelectorAll('ul.serversList li');
            elements.forEach(el => {
                const nameEl = el.querySelector('span p');
                const name = nameEl ? nameEl.innerText.trim() : '';
                const url = el.getAttribute('data-link');
                if (name && url) {
                    list.push({ name, url });
                }
            });
            return list;
        });

        // إغلاق المتصفح لتوفير استهلاك السيرفر
        await browser.close();

        res.json({ success: true, count: servers.length, data: servers });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ error: 'فشل المتصفح في استخراج السيرفرات: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
