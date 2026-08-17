const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');
const axios = require('axios'); // استخدام axios للثبات والموثوقية

const app = express();
app.use(express.json());

// ---------------------------------------------------------
// إعدادات الذاكرة المؤقتة (Cache لمدة 10 دقائق)
// ---------------------------------------------------------
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 دقائق

function getCachedData(key) {
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }
    return null;
}

function setCachedData(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------
// الهيكل الثابت
// ---------------------------------------------------------
const emptyResponse = {
    id: "", title: "", url: "", image: "", genres: "", quality: "", imdb: "", eclip_Num: ""
};

// ---------------------------------------------------------
// إعدادات Axios لتحسين الأداء وتجنب الحظر
// ---------------------------------------------------------
const axiosInstance = axios.create({
    timeout: 8000,
    headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    }
});

function formatUrl(url, baseUrl) {
    if (!url) return "";
    let fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
    return fullUrl.replace('/video.php?vid=', '/play.php?vid=');
}

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات (الآن يستخرج الصور فوراً)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = `page_${targetUrl}`;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(cachedResponse);
    }

    try {
        const response = await axiosInstance.get(targetUrl);
        const html = response.data;
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        const finalMoviesList = [];

        // استخراج البيانات مباشرة من القائمة الرئيسية
        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            if (index >= 30) return false; 

            const box = $(element);
            
            // استخراج الرابط
            const rawUrl = box.find('a').first().attr('href') || "";
            if (!rawUrl) return true;
            const movieUrl = formatUrl(rawUrl, baseUrl);

            // استخراج العنوان
            const title = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            
            // استخراج الجودة والمدة
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";
            const eclip_Num = box.find('.pm-label-duration').text().trim() || "";
            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            // 🔥 استخراج الصورة مباشرة وبشكل ذكي (بدون الحاجة لمسار image البطيء)
            let image = "";
            // 1. محاولة استخراج الصورة من الخلفية (style="background-image:...")
            const bgStyle = box.find('.pm-video-thumb').attr('style');
            if (bgStyle && bgStyle.includes('url(')) {
                image = bgStyle.split('url(')[1].split(')')[0].replace(/['"]/g, '');
            }
            // 2. محاولة استخراج الصورة من وسم img إذا وجدت
            if (!image) {
                image = box.find('img').attr('data-src') || box.find('img').attr('src') || "";
            }
            // تعديل الرابط إذا كان ناقصاً
            if (image && !image.startsWith('http')) {
                image = new URL(image, baseUrl).href;
            }
            // صورة افتراضية في حال الفشل المطلق
            if (!image) image = "https://via.placeholder.com/300x450?text=No+Image";

            finalMoviesList.push({
                id, title, url: movieUrl, image, quality, eclip_Num, genres: "", imdb: ""
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

// ملاحظة هامة: تم حذف مسار /api/image نهائياً لأنه لم يعد له حاجة، ولأنه كان يسبب بطء ومشاكل السيرفر.

// ---------------------------------------------------------
// المسار الثاني: استخراج المواسم
// ---------------------------------------------------------
app.get('/api/seasons', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    const cacheKey = `seasons_${targetUrl}`;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        const response = await axiosInstance.get(targetUrl);
        const html = response.data;
        const $ = cheerio.load(html);
        const seasonsList = [];
        
        let metaImage = $('meta[property="og:image"]').attr('content') || "";
        if(metaImage && !metaImage.startsWith('http')) {
             metaImage = new URL(metaImage, new URL(targetUrl).origin).href;
        }

        $('div.SeasonsBoxUL ul li').each((index, element) => {
            const li = $(element);
            const seasonNumber = li.attr('data-serie') || "";
            const title = li.text().trim() || `الموسم ${seasonNumber}`;
            const seasonUrl = `${targetUrl}&season_id=${seasonNumber}`;
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id, title, url: seasonUrl, image: metaImage, genres: "", quality: "", imdb: "", eclip_Num: "" 
            });
        });

        if (seasonsList.length === 0) return res.json([emptyResponse]);

        setCachedData(cacheKey, seasonsList);
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

    const cacheKey = `episodes_${targetUrl}`;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        let seasonId = req.query.season_id || new URL(targetUrl).searchParams.get('season_id');

        const response = await axiosInstance.get(targetUrl);
        const html = response.data;
        const $ = cheerio.load(html);
        const baseUrl = new URL(targetUrl).origin;
        
        let imageUrl = $('link[rel="image_src"]').attr('href') || $('meta[property="og:image"]').attr('content') || "";
        if (imageUrl && !imageUrl.startsWith('http')) imageUrl = new URL(imageUrl, baseUrl).href;

        const episodesList = [];
        let episodesContainer = seasonId ? $(`div.SeasonsEpisodes[data-serie="${seasonId}"]`) : $('div.SeasonsEpisodes').first();

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

            episodesList.push({ id, title, url: episodeUrl, image: imageUrl, genres: "", quality: "", imdb: "", eclip_Num });
        });

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

    const cacheKey = `watch_${targetUrl}`;
    const cachedResponse = getCachedData(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    try {
        const response = await axiosInstance.get(targetUrl);
        const html = response.data;
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
