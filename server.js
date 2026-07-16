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
// المسار الرابع: استخراج رابط السيرفر (iframe) السريع والمباشر
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) return res.send("");

    if (!targetUrl.endsWith('/watch/')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();
        
        // 🚀 تسريع التصفح بشكل خيالي عبر حظر الصور والستايلات والخطوط
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort(); // منع التحميل لتسريع العملية
            } else {
                request.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // الدخول للصفحة (لن تأخذ سوى ثانية أو ثانيتين الآن)
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // استخراج السيرفرات واستبعاد "متعدد الجودات"
        const servers = await page.$$eval('li.server--item', (items) => {
            let list = [];
            items.forEach((item, index) => {
                const text = item.innerText.trim();
                // أضف السيرفر للقائمة فقط إذا لم يكن "متعدد الجودات"
                if (!text.includes('متعدد الجودات')) {
                    list.push({ index: index, text: text });
                }
            });
            return list;
        });

        let workingIframeSrc = "";

        // فحص السيرفرات بالترتيب
        for (const server of servers) {
            try {
                const serverElements = await page.$$('li.server--item');
                if (serverElements[server.index]) {
                    await serverElements[server.index].click();
                    
                    // انتظار 1.5 ثانية فقط ليتم تحديث كود الـ iframe في الصفحة
                    await new Promise(r => setTimeout(r, 1500)); 

                    // سحب رابط الـ iframe الجديد
                    const iframeSrc = await page.$eval('iframe', el => el.src).catch(() => "");
                    
                    if (iframeSrc && iframeSrc.startsWith('http')) {
                        // فحص سريع جداً لمعرفة إذا كان رابط السيرفر يعمل فعلياً
                        const check = await fetch(iframeSrc, { method: 'HEAD' }).catch(() => null);
                        if (check && check.ok) {
                            workingIframeSrc = iframeSrc;
                            break; // وجدنا سيرفر شغال! توقف عن الفحص فوراً
                        }
                    }
                }
            } catch (e) {
                continue; // السيرفر هذا فيه مشكلة، انتقل للمحاولة مع السيرفر التالي
            }
        }

        await browser.close();
        
        // إرسال رابط السيرفر فقط كنص عادي
        res.setHeader('Content-Type', 'text/plain');
        res.send(workingIframeSrc || "");

    } catch (error) {
        if (browser) await browser.close();
        res.setHeader('Content-Type', 'text/plain');
        res.send("");
    }
});




// ---------------------------------------------------------
// المسار الخامس: 
// ---------------------------------------------------------
app.get('/api/watch1', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.send("");
    if (!targetUrl.endsWith('/watch/')) targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';

    let browser;
    let foundIframe = ""; // متغير لتخزين الرابط الصحيح فقط

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        
        // إعدادات أداء صارمة لمنع تحميل كل ما هو غير ضروري
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'script'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // مراقبة تغييرات الـ iframe وتطبيق الفلاتر
        page.on('framenavigated', async (frame) => {
            const url = frame.url();
            
            // قائمة الإعلانات والمواقع المزعجة التي نريد تجاهلها
            const blockedDomains = ['llvpn.com', 'google-analytics', 'googletagmanager', 'ads', 'adserver', 'pop'];
            
            // قائمة الكلمات الدلالية التي يجب أن يتضمنها رابط الفيديو
            const validKeywords = ['embed', 'vidtube', 'stream', 'filelion', 'tape', 'drive', 'm3u8'];

            const isAd = blockedDomains.some(domain => url.includes(domain));
            const isScript = url.endsWith('.js');
            const isVideoEmbed = validKeywords.some(keyword => url.includes(keyword));

            // الشرط النهائي للقبول: يجب أن يكون فيديو، وليس إعلاناً، وليس سكربت
            if (isVideoEmbed && !isAd && !isScript) {
                foundIframe = url;
            }
        });

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // استخراج السيرفرات (باستبعاد متعدد الجودات)
        const servers = await page.$$eval('li.server--item', els => 
            els.map((el, i) => ({ index: i, text: el.innerText }))
               .filter(s => !s.text.includes('متعدد الجودات'))
        );

        // النقر على السيرفرات بالتوالي حتى يتم التقاط رابط فيديو صحيح
        for (const s of servers) {
            if (foundIframe) break; // إذا وجدنا رابطاً صحيحاً، توقف فوراً

            const elements = await page.$$('li.server--item');
            if (elements[s.index]) {
                try {
                    await elements[s.index].click();
                    // انتظار قصير جداً للسماح بحدوث الـ navigation
                    await new Promise(r => setTimeout(r, 600)); 
                } catch (e) { continue; }
            }
        }

        await browser.close();

        res.setHeader('Content-Type', 'text/plain');
        res.send(foundIframe || ""); // إرسال الرابط الصحيح أو نص فارغ

    } catch (e) {
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
