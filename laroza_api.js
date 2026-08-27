const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------
// إعدادات الذاكرة المؤقتة (لتسريع الاستجابة للحد الأقصى)
// ---------------------------------------------------------
const pageCache = new Map(); // كاش للصفحات والبيانات
const imageCache = new Map(); // كاش لروابط الصور فقط
const CACHE_TTL = 10 * 60 * 1000; // مدة الكاش: 10 دقائق

function getCachedData(key) {
    const cached = pageCache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }
    return null;
}

function setCachedData(key, data) {
    pageCache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------
// الهيكل الثابت الموحد والدوال المساعدة
// ---------------------------------------------------------
const emptyResponse = {
    id: "", title: "", url: "", image: "", genres: "", quality: "", imdb: "", eclip_Num: ""
};

// دالة تنظيف العناوين من الكلمات المكررة والتسويقية
function cleanTitle(title) {
    if (!title) return "";
    return title
        .replace(/مترجم|اون\s*لاين|اونلاين|HD|1080p|720p|4k|مشاهدة|تحميل|جودة\s*عالية|كامل|حصرياً|حصريا|برابط\s*مباشر/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatUrl(url, baseUrl) {
    if (!url) return "";
    let fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
    return fullUrl.replace('/video.php?vid=', '/play.php?vid=');
}

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات (+ تنظيف العناوين)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = req.originalUrl;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(cachedResponse);
    }

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        const host = req.protocol + '://' + req.get('host');
        const finalMoviesList = [];

        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            if (index >= 30) return false; 

            const box = $(element);
            const rawUrl = box.find('a').first().attr('href') || "";
            if (!rawUrl) return true;

            const fetchUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            const movieUrl = formatUrl(rawUrl, baseUrl);
            const rawTitle = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            const title = cleanTitle(rawTitle); // تطبيق فلترة العنوان
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";
            const eclip_Num = box.find('.pm-label-duration').text().trim() || "";
            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            finalMoviesList.push({
                id, 
                title, 
                url: movieUrl,
                image: `${host}/floratv/api/image?url=${encodeURIComponent(fetchUrl)}&baseUrl=${encodeURIComponent(baseUrl)}`,
                quality, 
                eclip_Num,
                genres: "",
                imdb: ""
            });
        });

        if (finalMoviesList.length === 0) return res.json([emptyResponse]);

        setCachedData(cacheKey, finalMoviesList);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(finalMoviesList);

    } catch (error) {
        console.error("Error in /api/page:", error.message);
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثاني: مسار مسلسلات رمضان (بالهيكل الموحد)
// ---------------------------------------------------------
app.get('/api/ramadan', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = req.originalUrl;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(cachedResponse);
    }

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        const host = req.protocol + '://' + req.get('host');
        const ramadanList = [];

        $('a.icon-link').each((index, element) => {
            const aTag = $(element);
            const rawUrl = aTag.attr('href') || "";

            // تصفية ذكية: استخراج الروابط التي تحتوي على view-serie1.php فقط
            if (!rawUrl.includes('view-serie1.php')) return true;

            const rawTitle = aTag.text().trim();
            const title = cleanTitle(rawTitle);
            if (!title) return true;

            const fetchUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            const serieUrl = formatUrl(rawUrl, baseUrl);
            const id = serieUrl ? crypto.createHash('md5').update(serieUrl).digest('hex') : "";

            ramadanList.push({
                id,
                title,
                url: serieUrl,
                image: `${host}/floratv/api/image?url=${encodeURIComponent(fetchUrl)}&baseUrl=${encodeURIComponent(baseUrl)}`,
                quality: "",
                eclip_Num: "",
                genres: "",
                imdb: ""
            });
        });

        if (ramadanList.length === 0) return res.json([emptyResponse]);

        setCachedData(cacheKey, ramadanList);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(ramadanList);

    } catch (error) {
        console.error("Error in /api/ramadan:", error.message);
        res.json([emptyResponse]);
    }
});

app.get('/', (req, res) => {
    res.json([]);
});

// ---------------------------------------------------------
// المسار المساعد: استخراج الصورة والتوجيه إليها
// ---------------------------------------------------------
app.get('/api/image', async (req, res) => {
    const targetUrl = req.query.url;
    const baseUrl = req.query.baseUrl;
    const fallbackImage = "https://via.placeholder.com/300x450?text=No+Image";

    if (!targetUrl) return res.redirect(fallbackImage);

    if (imageCache.has(targetUrl)) {
        return res.redirect(imageCache.get(targetUrl));
    }

    try {
        const pageResponse = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(2500) 
        });
        
        const pageHtml = await pageResponse.text();
        const $$ = cheerio.load(pageHtml);
        
        let imageUrl = $$('link[rel="image_src"]').attr('href') || $$('meta[property="og:image"]').attr('content') || "";
        
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
// المسار التعديل الثالث (1): استخراج المواسم (دعم الهيكل الجديد)
// ---------------------------------------------------------
app.get('/api/seasons', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = req.originalUrl;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const seasonsList = [];
        const metaImage = $('meta[property="og:image"]').attr('content') || "";

        // فحص الأزرار في الهيكل الجديد أولاً (button.tablinks)
        const tabButtons = $('div.SeasonsBoxUL button.tablinks, div.Tab button.tablinks');

        if (tabButtons.length > 0) {
            tabButtons.each((index, element) => {
                const btn = $(element);
                const title = cleanTitle(btn.text().trim());
                const onclick = btn.attr('onclick') || "";

                // استخراج معرف الموسم مثل Season1 من openCity(event, 'Season1')
                const match = onclick.match(/openCity\([^,]+,\s*['"]([^'"]+)['"]\)/);
                const seasonId = match ? match[1] : `Season${index + 1}`;

                const seasonUrl = `${targetUrl}&season_id=${seasonId}`;
                const id = crypto.createHash('md5').update(seasonUrl).digest('hex');

                seasonsList.push({
                    id, title, url: seasonUrl, image: metaImage, genres: "", quality: "", imdb: "", eclip_Num: "" 
                });
            });
        } else {
            // بديل: الهيكل القديم (ul li)
            $('div.SeasonsBoxUL ul li').each((index, element) => {
                const li = $(element);
                const seasonNumber = li.attr('data-serie') || "";
                const title = cleanTitle(li.text().trim()) || `الموسم ${seasonNumber}`;
                const seasonUrl = `${targetUrl}&season_id=${seasonNumber}`;
                const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

                seasonsList.push({
                    id, title, url: seasonUrl, image: metaImage, genres: "", quality: "", imdb: "", eclip_Num: "" 
                });
            });
        }

        if (seasonsList.length === 0) return res.json([emptyResponse]);

        setCachedData(cacheKey, seasonsList);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(seasonsList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار التعديل الثالث (2): استخراج الحلقات (دعم الهيكل الجديد)
// ---------------------------------------------------------
app.get('/api/episodes', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = req.originalUrl;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        let seasonId = req.query.season_id || new URL(targetUrl).searchParams.get('season_id');

        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        
        let defaultImageUrl = $('link[rel="image_src"]').attr('href') || $('meta[property="og:image"]').attr('content') || "";
        if (defaultImageUrl && !defaultImageUrl.startsWith('http')) defaultImageUrl = new URL(defaultImageUrl, baseUrl).href;

        const episodesList = [];

        // تحديد الحاوية المناسبة بناءً على الموسم إن وجد
        let container = $;
        if (seasonId) {
            if ($(`#${seasonId}`).length > 0) {
                container = $(`#${seasonId}`);
            } else if ($(`div.SeasonsEpisodes[data-serie="${seasonId}"]`).length > 0) {
                container = $(`div.SeasonsEpisodes[data-serie="${seasonId}"]`);
            }
        }

        // 1. فحص الهيكل الجديد للحلقات (li.col-xs-6 مع thumbnail)
        const newEpisodeItems = container.find('li.col-xs-6, li.col-sm-4, li.col-md-3');

        if (newEpisodeItems.length > 0) {
            newEpisodeItems.each((i, el) => {
                const item = $(el);
                const aTag = item.find('.pm-video-thumb a, .caption h3 a, a').first();
                let rawUrl = aTag.attr('href') || "";
                if (!rawUrl) return true;

                let episodeUrl = formatUrl(rawUrl, baseUrl);
                const rawTitle = item.find('.caption h3 a').text().trim() || aTag.attr('title') || "";
                const title = cleanTitle(rawTitle);

                // جلب صورة الحلقة المباشرة إن وجدت في العنصر
                let imgTagSrc = item.find('img').attr('src') || item.find('img').attr('data-src') || "";
                let episodeImage = defaultImageUrl;
                if (imgTagSrc) {
                    episodeImage = imgTagSrc.startsWith('http') ? imgTagSrc : new URL(imgTagSrc, baseUrl).href;
                }

                // استخراج رقم الحلقة من النص
                const epMatch = rawTitle.match(/الحلقة\s*(\d+)/i) || rawTitle.match(/حلقة\s*(\d+)/i);
                const eclip_Num = epMatch ? `الحلقة ${epMatch[1]}` : "";
                const id = crypto.createHash('md5').update(episodeUrl).digest('hex');

                episodesList.push({ id, title, url: episodeUrl, image: episodeImage, genres: "", quality: "", imdb: "", eclip_Num });
            });
        } 
        
        // 2. إذا لم يجد شيئاً بالهيكل الجديد، تجربة الهيكل القديم
        if (episodesList.length === 0) {
            let episodesContainer = seasonId ? $(`div.SeasonsEpisodes[data-serie="${seasonId}"]`) : $('div.SeasonsEpisodes').first();

            episodesContainer.find('a').each((i, el) => {
                const aTag = $(el);
                let rawUrl = aTag.attr('href') || "";
                if (!rawUrl) return true;

                let episodeUrl = formatUrl(rawUrl, baseUrl);
                const rawTitle = aTag.attr('title') || aTag.text().trim() || "";
                const title = cleanTitle(rawTitle);
                const epNumText = aTag.find('em').text().trim();
                const eclip_Num = epNumText ? `الحلقة ${epNumText}` : "";
                const id = crypto.createHash('md5').update(episodeUrl).digest('hex');

                episodesList.push({ id, title, url: episodeUrl, image: defaultImageUrl, genres: "", quality: "", imdb: "", eclip_Num });
            });
        }

        if (episodesList.length === 0) return res.json([emptyResponse]);

        setCachedData(cacheKey, episodesList);
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

    const cacheKey = req.originalUrl;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
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
                validServers.push({ url: iframeSrc });
            }
        });

        if (validServers.length === 1) {
            const directIframe = $('iframe').first().attr('src');
            if (directIframe && directIframe.startsWith('http') && directIframe !== targetUrl) {
                validServers.push({ url: directIframe });
            }
        }

        setCachedData(cacheKey, validServers);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(validServers);

    } catch (error) {
        console.error("Error in /api/watch:", error.message);
        return res.json([{ url: targetUrl }]);
    }
});

module.exports = app;
