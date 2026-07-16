const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');
const puppeteer = require('puppeteer'); // تم نقلها للأعلى لتنظيم الكود

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الثابت الموحد لجميع المسارات مع إضافة حقل رقم الحلقة
const emptyResponse = {
    id: "",
    title: "",
    url: "",
    image: "",
    genres: "",
    quality: "",
    imdb: "",
    eclip_Num: ""
};

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];

        $('div.Small--Box:not(.Season)').each((index, element) => {
            const box = $(element);
            const movieUrl = box.find('a.recent--block').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            
            const imgTag = box.find('div.Poster img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            let genre = "";
            let quality = "";
            let imdbRating = "";

            box.find('ul.liList li').each((i, li) => {
                const text = $(li).text().trim();
                if ($(li).hasClass('imdbRating')) {
                    imdbRating = text.replace(/[^\d.]/g, ''); 
                } else {
                    if (/p|web|bluray|hd|cam/i.test(text)) {
                        quality = text;
                    } else {
                        if (!genre) genre = text;
                    }
                }
            });

            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            moviesList.push({
                id, 
                title, 
                url: movieUrl, 
                image: imageUrl, 
                genres: genre, 
                quality, 
                imdb: imdbRating,
                eclip_Num: "" // فارغ في حالة الأفلام
            });
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);
    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثاني: استخراج المواسم
// ---------------------------------------------------------
app.get('/api/seasons', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const seasonsList = [];

        $('section.allseasonss div.Small--Box.Season').each((index, element) => {
            const box = $(element);

            const seasonUrl = box.find('a').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            
            const imgTag = box.find('div.Poster img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id: id,
                title: title,
                url: seasonUrl,
                image: imageUrl,
                genres: "",
                quality: "",
                imdb: "",
                eclip_Num: "" // فارغ في حالة المواسم
            });
        });

        if (seasonsList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(seasonsList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثالث: استخراج الحلقات
// ---------------------------------------------------------
app.get('/api/episodes', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const episodesList = [];

        // استهداف روابط الحلقات من داخل الكلاس المخصص
        $('section.allepcont.getMoreByScroll a').each((index, element) => {
            const el = $(element);
            
            const url = el.attr('href') || "";
            const title = el.find('.ep-info h2').text().trim() || "";
            
            // استخراج الصورة مع دعم التحميل المتأخر (Lazy Load)
            const imgTag = el.find('.image img');
            const image = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";
            
            // استخراج رقم الحلقة فقط
            const epNumText = el.find('.epnum').text().trim();
            const eclip_Num = epNumText.replace(/\D/g, '') || ""; 

            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";

            episodesList.push({
                id: id,
                title: title,
                url: url,
                image: image,
                genres: "", 
                quality: "", 
                imdb: "",
                eclip_Num: eclip_Num 
            });
        });

        if (episodesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(episodesList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الرابع: استخراج رابط m3u8 من صفحة المشاهدة
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.send(""); 
    }

    // 1. تهيئة وتعديل الرابط لينتهي بـ watch/
    if (!targetUrl.endsWith('/watch/')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';
    }

    console.log(`\n=== بدء فحص صفحة المشاهدة للرابط: ${targetUrl} ===`);

    let browser;
    try {
        // 2. تشغيل المتصفح بإعدادات مخفية ومحسنة للبيئات السحابية (تقليل استهلاك الرام)
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process' 
            ]
        });

        const page = await browser.newPage();
        
        // إخفاء هوية البوت وتزويده بمتصفح حقيقي لتجنب جدران الحماية
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        let foundM3u8 = "";

        // 3. مراقبة الـ Network فور بدء إرسال الطلبات للالتقاط اللحظي والمباشر للرابط
        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('.m3u8') && !foundM3u8) {
                console.log(`=> تم التقاط رابط m3u8 مباشر: ${url}`);
                foundM3u8 = url; // حفظ الرابط فوراً بمجرد ظهوره في الشبكة
            }
        });

        // 4. الدخول للصفحة وانتظار تحميل الـ DOM الأساسي
        console.log("-> جاري تحميل الصفحة...");
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // الانتظار ثوانٍ بسيطة للتأكد من استقرار أزرار السيرفرات في الصفحة
        await page.waitForSelector('li.server--item', { timeout: 15000 }).catch(() => {
            console.log("تنبيه: لم تظهر قائمة السيرفرات في الوقت المحدد.");
        });

        // 5. جلب السيرفرات وترتيبها (تأخير "متعدد الجودات" للنهاية)
        const servers = await page.$$eval('li.server--item', (items) => {
            let serverList = [];
            items.forEach((item, index) => {
                const text = item.innerText.trim();
                serverList.push({
                    index: index,
                    text: text,
                    priority: text.includes('متعدد الجودات') ? 99 : index
                });
            });
            return serverList.sort((a, b) => a.priority - b.priority);
        });

        console.log(`=> تم العثور على ${servers.length} سيرفرات جاهزة للفحص.`);

        // 6. محاكاة النقر الفعلي على السيرفرات بالتوالي
        for (const server of servers) {
            if (foundM3u8) break; // توقف تام عند نجاح التقاط الرابط

            console.log(`-> جاري النقر لتشغيل سيرفر: ${server.text}`);
            try {
                const serverElements = await page.$$('li.server--item');
                if (serverElements[server.index]) {
                    await serverElements[server.index].click();
                    
                    // انتظار 5 ثوانٍ بعد الضغط للسماح لـ iframe الخاص بالسيرفر بالتحميل وبث رابط m3u8
                    await new Promise(r => setTimeout(r, 5000));
                }
            } catch (clickErr) {
                console.log(`فشل النقر على سيرفر: ${server.text}`);
            }
        }

        // إغلاق المتصفح لعدم استنزاف موارد خادم الـ Render
        await browser.close();

        // 7. إرسال رابط m3u8 النهائي كنص عادي ومباشر
        res.setHeader('Content-Type', 'text/plain');
        res.send(foundM3u8 || "");

    } catch (error) {
        console.error("!!! حدث خطأ غير متوقع:", error.message);
        if (browser) await browser.close();
        res.setHeader('Content-Type', 'text/plain');
        res.send("");
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
