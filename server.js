const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

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
// المسار الثالث (الجديد): استخراج الحلقات
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
                genres: "", // الحلقات عادة لا تعرض تصنيفاً في هذه القائمة
                quality: "", 
                imdb: "",
                eclip_Num: eclip_Num // هنا يتم إدراج رقم الحلقة المستخرج
            });
        });

        if (episodesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(episodesList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});




const puppeteer = require('puppeteer'); // أضف هذا في أعلى الملف مع باقي المكتبات

// ---------------------------------------------------------
// المسار الرابع (الأصعب): استخراج رابط m3u8 من صفحة المشاهدة
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.send(""); // إرجاع فارغ إذا لم يتم إرسال رابط
    }

    // 1. إضافة watch/ للرابط إذا لم تكن موجودة
    if (!targetUrl.endsWith('/watch/')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';
    }

    let browser;
    try {
        // تشغيل متصفح كروم المخفي بإعدادات تتناسب مع السيرفرات السحابية
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
        
        let foundM3u8 = ""; // المتغير الذي سنحفظ فيه الرابط

        // 2. مراقبة الـ Network بالكامل
        page.on('response', async (response) => {
            const url = response.url();
            // التقاط أي رابط يحتوي على .m3u8
            if (url.includes('.m3u8') && !foundM3u8) {
                try {
                    // فحص الرابط الملتقط إذا كان شغالاً ويعطي استجابة 200
                    const check = await fetch(url, { method: 'HEAD' });
                    if (check.ok) {
                        foundM3u8 = url; // حفظ الرابط الشغال
                    }
                } catch (err) {
                    // تجاهل الرابط التالف
                }
            }
        });

        // 3. الدخول إلى صفحة المشاهدة
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 4. استخراج وترتيب أزرار السيرفرات
        const servers = await page.$$eval('li.server--item', (items) => {
            let serverList = [];
            items.forEach((item, index) => {
                const text = item.innerText.trim();
                serverList.push({
                    index: index,
                    text: text,
                    // إعطاء أولوية منخفضة جداً لسيرفر "متعدد الجودات" ليكون الأخير
                    priority: text.includes('متعدد الجودات') ? 99 : index
                });
            });
            // ترتيب السيرفرات بناءً على الأولوية
            return serverList.sort((a, b) => a.priority - b.priority);
        });

        // 5. النقر على السيرفرات واحداً تلو الآخر للبحث عن m3u8
        for (const server of servers) {
            if (foundM3u8) break; // التوقف عن الفحص إذا تم العثور على رابط شغال

            try {
                // النقر على زر السيرفر
                const serverElements = await page.$$('li.server--item');
                if (serverElements[server.index]) {
                    await serverElements[server.index].click();
                    
                    // الانتظار لمدة 5 ثوانٍ لإعطاء فرصة لـ iframe للتحميل وإرسال طلب m3u8 للشبكة
                    await new Promise(r => setTimeout(r, 5000));
                }
            } catch (clickErr) {
                console.log(`فشل النقر على السيرفر: ${server.text}`);
            }
        }

        // إغلاق المتصفح بعد الانتهاء لعدم استهلاك رامات السيرفر
        await browser.close();

        // 6. إرجاع رابط m3u8 كـ نص عادي فقط (بدون JSON) كما طلبت
        res.setHeader('Content-Type', 'text/plain');
        res.send(foundM3u8 || "");

    } catch (error) {
        if (browser) await browser.close();
        res.setHeader('Content-Type', 'text/plain');
        res.send(""); // إرجاع فارغ في حال حدوث أي خطأ
    }
});


// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
