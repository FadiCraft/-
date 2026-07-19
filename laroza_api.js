const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الثابت الموحد لجميع المسارات 
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

// دالة مساعدة لتعديل الروابط (تغيير video إلى play وتحويل الروابط النسبية لكاملة)
function formatUrl(url, baseUrl) {
    if (!url) return "";
    let fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
    return fullUrl.replace('/video.php?vid=', '/play.php?vid=');
}

// دالة لتنظيف رابط الصورة وتجنب روابط base64
function cleanImageUrl(imgTag, baseUrl) {
    let url = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";
    if (url.startsWith('data:image')) {
        url = ""; // تجاهل الصور الوهمية
    }
    if (url && !url.startsWith('http')) {
        url = new URL(url, baseUrl).href;
    }
    return url;
}


// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات (باستخدام Puppeteer)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    let browser;
    try {
        // تشغيل المتصفح المخفي
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // تعيين User-Agent ليبدو كمتصفح حقيقي
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
        
        // الانتقال للصفحة المطلوبة
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // سكريبت يتم تنفيذه داخل المتصفح للنزول لأسفل الصفحة تدريجياً وتحفيز ظهور الصور
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100; // مسافة النزول في كل مرة
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    // التوقف عند الوصول لنهاية الصفحة أو بعد مسافة معينة
                    if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 4000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100); // سرعة النزول
            });
        });

        // انتظار ثانية إضافية للتأكد من أن الصور أخذت وقتها في التحميل
        await new Promise(r => setTimeout(r, 1000));

        // استخراج البيانات بعد ظهور الصور الحقيقية
        const baseUrl = new URL(targetUrl).origin;
        const extractedData = await page.evaluate((baseUrl) => {
            const results = [];
            // تحديد العناصر
            const items = document.querySelectorAll('li.col-xs-6.col-sm-4.col-md-3');

            items.forEach(box => {
                const aTag = box.querySelector('a');
                let rawUrl = aTag ? aTag.getAttribute('href') : "";
                
                // تعديل الرابط ليكون play.php بدلاً من video.php
                let movieUrl = rawUrl;
                if (rawUrl) {
                    movieUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
                    movieUrl = movieUrl.replace('/video.php?vid=', '/play.php?vid=');
                }
                
                // العنوان
                const titleTag = box.querySelector('.caption h3 a');
                const title = titleTag ? titleTag.innerText.trim() : (aTag ? aTag.getAttribute('title') : "");

                // الصورة (الآن بعد النزول للأسفل، سمة src ستحتوي على الرابط الحقيقي)
                const imgTag = box.querySelector('img.img-responsive');
                let imageUrl = "";
                if (imgTag) {
                    imageUrl = imgTag.getAttribute('src') || imgTag.getAttribute('data-src') || "";
                    // إذا كان لا يزال يحمل base64 نتجاهله
                    if (imageUrl.startsWith('data:image')) {
                        imageUrl = imgTag.getAttribute('data-src') || "";
                    }
                    if (imageUrl && !imageUrl.startsWith('http')) {
                        imageUrl = new URL(imageUrl, baseUrl).href;
                    }
                }

                // الجودة
                const qualityTag = box.querySelector('.pm-video-labels .hot');
                const quality = qualityTag ? qualityTag.innerText.trim() : "";

                // المدة أو رقم الحلقة
                const durationTag = box.querySelector('.pm-label-duration');
                const eclip_Num = durationTag ? durationTag.innerText.trim() : "";

                results.push({
                    title: title,
                    url: movieUrl,
                    image: imageUrl,
                    genres: "",
                    quality: quality,
                    imdb: "",
                    eclip_Num: eclip_Num
                });
            });
            return results;
        }, baseUrl);

        await browser.close();

        // إنشاء التشفير (ID) في بيئة السيرفر (Node.js) لأن مكتبة crypto لا تعمل داخل المتصفح
        const finalMoviesList = extractedData.map(movie => {
            const id = movie.url ? crypto.createHash('md5').update(movie.url).digest('hex') : "";
            return {
                id: id,
                title: movie.title,
                url: movie.url,
                image: movie.image,
                genres: movie.genres,
                quality: movie.quality,
                imdb: movie.imdb,
                eclip_Num: movie.eclip_Num
            };
        });

        if (finalMoviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(finalMoviesList);

    } catch (error) {
        console.error("خطأ في المسار الأول:", error.message);
        if (browser) await browser.close();
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

        // استخراج صورة الموسم من الميتا تاج كما طلبت
        const metaImage = $('meta[property="og:image"]').attr('content') || "";

        $('div.SeasonsBoxUL ul li').each((index, element) => {
            const li = $(element);
            const seasonNumber = li.attr('data-serie') || "";
            const title = li.text().trim() || `الموسم ${seasonNumber}`;
            
            // تجهيز رابط الموسم لكي يقرأه مسار الحلقات لاحقاً
            const seasonUrl = `${targetUrl}&season_id=${seasonNumber}`;
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id: id,
                title: title,
                url: seasonUrl,
                image: metaImage, // إضافة الصورة الموحدة للمواسم
                genres: "",
                quality: "",
                imdb: "",
                eclip_Num: "" 
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
    let targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    // فصل الرابط الأصلي عن رقم الموسم
    let seasonId = "1";
    if (targetUrl.includes('&season_id=')) {
        const parts = targetUrl.split('&season_id=');
        targetUrl = parts[0];
        seasonId = parts[1];
    }

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const episodesList = [];
        const baseUrl = new URL(targetUrl).origin;

        // استخراج صورة الغلاف لتكون صورة للحلقة (في حال عدم وجود صور للحلقات)
        const metaImage = $('meta[property="og:image"]').attr('content') || "";

        // التركيز فقط على الـ div الخاص برقم الموسم المستهدف (سواء كان مخفي أو ظاهر)
        $(`div.SeasonsEpisodes[data-serie="${seasonId}"] a`).each((index, element) => {
            const aTag = $(element);
            
            const rawUrl = aTag.attr('href') || "";
            const url = formatUrl(rawUrl, baseUrl); // تعديل الرابط ليكون play.php
            
            const title = aTag.attr('title') || "";
            const epNum = aTag.find('em').text().trim() || "";

            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";

            episodesList.push({
                id: id,
                title: title,
                url: url,
                image: metaImage, // تعيين الصورة
                genres: "", 
                quality: "", 
                imdb: "",
                eclip_Num: epNum 
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
// المسار الرابع: استخراج السيرفرات
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.json([]);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        const html = await response.text();
        const $ = cheerio.load(html);
        const validServers = [];

        // استخراج الروابط المباشرة للسيرفرات
        $('ul.WatchList li').each((index, element) => {
            const li = $(element);
            const iframeSrc = li.attr('data-embed-url') || "";

            // فلترة السيرفرات الإعلانية والمزعجة
            const blockedDomains = ['llvpn', 'ads', 'pop', 'blank', 'd0o0d', 'updown.icu'];
            const isBlocked = blockedDomains.some(d => iframeSrc.includes(d));

            if (iframeSrc && iframeSrc.startsWith('http') && !isBlocked) {
                validServers.push({
                    url: iframeSrc // تم حذف الاسم كما طلبت ليكون الهيكل url فقط
                });
            }
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        if (validServers.length > 0) {
            return res.json(validServers);
        } else {
            // كود احتياطي في حال كان هناك iframe مباشر داخل الصفحة
            const directIframe = $('iframe').first().attr('src');
            if (directIframe && directIframe.startsWith('http')) {
                 return res.json([{ url: directIframe }]);
            }
            return res.json([]);
        }

    } catch (error) {
        console.error("خطأ السيرفرات:", error.message);
        return res.json([]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
