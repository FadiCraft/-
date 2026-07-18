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
// المسار الأول: استخراج الأفلام والمسلسلات (مع رقم الحلقة)
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
            
            // استخراج الرابط (يدعم الأقسام العادية وقسم نتفليكس)
            const movieUrl = box.find('a.recent--block').attr('href') || box.find('a').first().attr('href') || "";
            
            // استخراج العنوان
            const title = box.find('h3.title').text().trim() || "";
            
            // استخراج الصورة
            const imgTag = box.find('div.Poster img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            // 📌 التعديل الجديد: استخراج رقم الحلقة للمسلسلات
            const epNumText = box.find('div.number').text().trim();
            // استخدام Regex لحذف أي نصوص مثل كلمة "حلقة" والإبقاء على الأرقام فقط
            const eclip_Num = epNumText.replace(/\D/g, '') || "";

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
                eclip_Num: eclip_Num // سيتم وضع الرقم هنا إن وجد، وإلا سيكون فارغاً للأفلام
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
// المسار السريع لاستخراج السيرفرات كلها بصيغة JSON (باستثناء الأول 0 و updown)
// ---------------------------------------------------------

app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;
    
    // إرجاع مصفوفة فارغة بصيغة JSON في حال عدم وجود رابط أو خطأ
    if (!targetUrl) return res.json([]);
    if (!targetUrl.endsWith('/watch/')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';
    }

    try {
        const pageResponse = await fetch(encodeURI(targetUrl), {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        const pageHtml = await pageResponse.text();
        const $ = cheerio.load(pageHtml);

        // 1. استخراج الـ ID
        const firstServerBtn = $('.server--item').first();
        const postId = firstServerBtn.attr('data-id') || "";
        if (!postId) return res.json([]);

        // 2. استخراج جميع أرقام السيرفرات المتاحة (مع استثناء الأول 0)
        const serverIndexes = [];
        $('.server--item').each((i, el) => {
            const serverNum = $(el).attr('data-server');
            // لا تضف السيرفر إذا كان ترتيبه الأول (i === 0) أو رقمه 0
            if (i > 0 && serverNum !== "0") { 
                serverIndexes.push(serverNum);
            }
        });

        // 3. تجربة السيرفرات بالترتيب وتخزين الشغال منها
        const serverUrl = "https://topcinma.com/wp-content/themes/movies2023/Ajaxat/Single/Server.php";
        const validServers = []; // مصفوفة لتخزين السيرفرات الشغالة
        
        for (let i of serverIndexes) {
            try {
                const serverResponse = await fetch(serverUrl, {
                    method: 'POST',
                    body: `id=${postId}&i=${i}`,
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest",
                        "Referer": encodeURI(targetUrl)
                    }
                });

                const serverHtml = await serverResponse.text();
                const $$ = cheerio.load(serverHtml);
                const iframeSrc = $$('iframe').attr('src') || "";

                // 4. التحقق مما إذا كان الرابط صالحاً 
                // تمت إضافة 'updown' و 'updown.icu' لمنع هذا السيرفر نهائياً
                const blockedDomains = ['llvpn', 'ads', 'pop', 'blank', 'updown.icu', 'updown'];
                const isBlocked = blockedDomains.some(d => iframeSrc.includes(d));

                if (iframeSrc && iframeSrc.startsWith('http') && !isBlocked) {
                    console.log(`✅ تم العثور على سيرفر صالح: ${iframeSrc}`);
                    // إضافة السيرفر للقائمة بالصيغة المطلوبة
                    validServers.push({
                        url: iframeSrc
                    });
                }
            } catch (err) {
                console.error(`⚠️ خطأ أثناء فحص السيرفر رقم ${i}:`, err.message);
            }
        }

        // 5. إرجاع النتائج بصيغة JSON
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (validServers.length > 0) {
            return res.json(validServers);
        } else {
            console.log("❌ لم يتم العثور على أي سيرفر صالح.");
            return res.json([]);
        }

    } catch (error) {
        console.error("خطأ عام:", error.message);
        return res.json([]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
