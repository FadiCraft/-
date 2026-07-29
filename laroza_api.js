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

// 🧠 ذاكرة مؤقتة لتخزين روابط الصور التي تم استخراجها سابقاً لعدم تكرار الطلبات
const imageCache = new Map();

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
// المسار الأول: استخراج الأفلام والمسلسلات (إصدار فائق السرعة)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        
        // بناء رابط السيرفر لطلب الصور عبر المسار الديناميكي
        const host = req.protocol + '://' + req.get('host');
        const finalMoviesList = [];

        // استخراج البيانات المباشرة من الصفحة بدون انتظار صفحات التفاصيل
        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            if (index >= 30) return false; // التوقف عند 30 عنصر

            const box = $(element);
            const rawUrl = box.find('a').first().attr('href') || "";
            if (!rawUrl) return true;

            const fetchUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            const movieUrl = formatUrl(rawUrl, baseUrl);
            
            const title = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";
            const eclip_Num = box.find('.pm-label-duration').text().trim() || "";
            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            finalMoviesList.push({
                id, 
                title, 
                url: movieUrl,
                // نرسل رابط الصورة إلى مسار معالجة الصور الديناميكي في سيرفرك
                image: `${host}/api/image?url=${encodeURIComponent(fetchUrl)}&baseUrl=${encodeURIComponent(baseUrl)}`,
                quality, 
                eclip_Num,
                genres: "",
                imdb: ""
            });
        });

        if (finalMoviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(finalMoviesList);

    } catch (error) {
        console.error("خطأ في المسار الأول:", error.message);
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار المساعد: استخراج الصورة والتوجيه إليها (Dynamic Image Proxy)
// ---------------------------------------------------------
app.get('/api/image', async (req, res) => {
    const targetUrl = req.query.url;
    const baseUrl = req.query.baseUrl;
    
    // رابط صورة افتراضية في حال تعذر جلب الصورة
    const fallbackImage = "https://via.placeholder.com/300x450?text=No+Image";

    if (!targetUrl) return res.redirect(fallbackImage);

    // 1. العودة للصورة المحفوظة في الكاش فوراً إن وجدت
    if (imageCache.has(targetUrl)) {
        return res.redirect(imageCache.get(targetUrl));
    }

    try {
        // 2. طلب الصفحة الداخلية للفيلم بمهلة 2.5 ثانية
        const pageResponse = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(2500) 
        });
        
        const pageHtml = await pageResponse.text();
        const $$ = cheerio.load(pageHtml);
        
        let imageUrl = $$('link[rel="image_src"]').attr('href') || 
                       $$('meta[property="og:image"]').attr('content') || "";
        
        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, baseUrl).href;
        }

        if (imageUrl) {
            imageCache.set(targetUrl, imageUrl);
            return res.redirect(imageUrl);
        } else {
            return res.redirect(fallbackImage);
        }
    } catch (err) {
        return res.redirect(fallbackImage);
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

        const metaImage = $('meta[property="og:image"]').attr('content') || "";

        $('div.SeasonsBoxUL ul li').each((index, element) => {
            const li = $(element);
            const seasonNumber = li.attr('data-serie') || "";
            const title = li.text().trim() || `الموسم ${seasonNumber}`;
            
            const seasonUrl = `${targetUrl}&season_id=${seasonNumber}`;
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id: id,
                title: title,
                url: seasonUrl,
                image: metaImage,
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
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        let seasonId = req.query.season_id; 
        if (!seasonId) {
            const urlObj = new URL(targetUrl);
            seasonId = urlObj.searchParams.get('season_id');
        }

        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        
        let imageUrl = $('link[rel="image_src"]').attr('href') || $('meta[property="og:image"]').attr('content') || "";
        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, baseUrl).href;
        }

        const episodesList = [];
        
        let episodesContainer;
        if (seasonId) {
            episodesContainer = $(`div.SeasonsEpisodes[data-serie="${seasonId}"]`);
        } else {
            episodesContainer = $('div.SeasonsEpisodes').first();
        }

        episodesContainer.find('a').each((i, el) => {
            const aTag = $(el);
            let rawUrl = aTag.attr('href') || "";
            
            if (!rawUrl) return true;

            let episodeUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            episodeUrl = episodeUrl.replace('/video.php?vid=', '/play.php?vid=');

            const title = aTag.attr('title') || aTag.text().trim() || "";
            const epNumText = aTag.find('em').text().trim();
            const eclip_Num = epNumText ? `الحلقة ${epNumText}` : "";
            const id = crypto.createHash('md5').update(episodeUrl).digest('hex');

            episodesList.push({
                id,
                title,
                url: episodeUrl,
                image: imageUrl,
                genres: "",
                quality: "",
                imdb: "",
                eclip_Num
            });
        });

        if (episodesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(episodesList);

    } catch (error) {
        console.error("خطأ في استخراج الحلقات:", error.message);
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
        
        const validServers = [{ url: targetUrl }];
        const listItems = $('ul.WatchList li');
        const blockedDomains = ['llvpn', 'ads', 'pop', 'blank', 'd0o0d', 'updown.icu'];

        listItems.each((index, element) => {
            const li = $(element);
            const iframeSrc = li.attr('data-embed-url') || "";
            const isBlocked = blockedDomains.some(d => iframeSrc.includes(d));

            if (iframeSrc && iframeSrc.startsWith('http') && !isBlocked && iframeSrc !== targetUrl) {
                validServers.push({
                    url: iframeSrc
                });
            }
        });

        if (validServers.length === 1) {
            const directIframe = $('iframe').first().attr('src');
            if (directIframe && directIframe.startsWith('http') && directIframe !== targetUrl) {
                validServers.push({ url: directIframe });
            }
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(validServers);

    } catch (error) {
        console.error("خطأ السيرفرات:", error.message);
        return res.json([{ url: targetUrl }]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
