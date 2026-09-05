const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');
const puppeteer = require('puppeteer'); 

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

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات (الهيكل الجديد)
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

        // الاستهداف الجديد للعناصر
        $('div.entry-box').each((index, element) => {
            const box = $(element);
            
            // استخراج الرابط 
            const movieUrl = box.find('h3 a').attr('href') || box.find('.entry-image a').attr('href') || "";
            
            // استخراج العنوان
            const title = box.find('h3 a').text().trim() || "";
            
            // استخراج الصورة
            const imgTag = box.find('.entry-image img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            // استخراج رقم الحلقة من الكلاس الجديد label series
            let eclip_Num = "";
            const seriesLabel = box.find('.label.series').text().trim();
            if (seriesLabel) {
                // استخراج الرقم فقط وإضافة كلمة حلقة (أو يمكنك ترك الرقم فقط حسب تصميم تطبيقك)
                const num = seriesLabel.replace(/\D/g, '');
                if(num) eclip_Num = "حلقة " + num; 
            }

            // استخراج التصنيف (مثال: افلام اجنبي)
            let genre = box.find('.badge-light').text().trim() || "";
            let quality = box.find('.badge-secondary').text().trim() || ""; 

            // استخراج تقييم IMDB
            let imdbRating = box.find('.label.rating').text().replace(/[^\d.]/g, '') || "";

            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            if (title && movieUrl) {
                moviesList.push({
                    id, 
                    title, 
                    url: movieUrl, 
                    image: imageUrl, 
                    genres: genre, 
                    quality, 
                    imdb: imdbRating,
                    eclip_Num: eclip_Num 
                });
            }
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);
    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثاني: استخراج المواسم (الهيكل الجديد)
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

        // الاستهداف الجديد للمواسم
        $('#series-episodes .widget-body a').each((index, element) => {
            const el = $(element);

            const seasonUrl = el.attr('href') || "";
            const title = el.text().trim() || "";
            
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            if (title && seasonUrl) {
                seasonsList.push({
                    id: id,
                    title: title,
                    url: seasonUrl,
                    image: "", // المواسم في الهيكل الجديد لا تحتوي على صور منفصلة
                    genres: "",
                    quality: "",
                    imdb: "",
                    eclip_Num: "" 
                });
            }
        });

        if (seasonsList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(seasonsList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثالث: استخراج الحلقات (الهيكل الجديد)
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

        // الاستهداف الجديد للحلقات
        $('div.bg-primary2').each((index, element) => {
            const el = $(element);
            
            const titleElement = el.find('h2 a');
            const url = titleElement.attr('href') || "";
            const title = titleElement.text().trim() || "";
            
            const imgTag = el.find('picture img');
            const image = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";
            
            // استخراج رقم الحلقة من الـ alt الخاص بالصورة (مثال: alt="19 : الحلقة ")
            const altText = imgTag.attr('alt') || "";
            const eclip_Num = altText.replace(/\D/g, '') || ""; 

            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";

            if (title && url) {
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
            }
        });

        if (episodesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(episodesList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الرابع: استخراج السيرفرات بصيغة JSON (طريقة جديدة وأسرع)
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;
    
    if (!targetUrl) return res.json([]);
    
    // إضافة /watch/ لفتح صفحة المشاهدة والسيرفرات
    if (!targetUrl.endsWith('/watch/')) {
        targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';
    }

    try {
        const pageResponse = await fetch(encodeURI(targetUrl), {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        const pageHtml = await pageResponse.text();
        const $ = cheerio.load(pageHtml);
        const validServers = [];

        // قائمة الدومينات المحظورة (كما هي في الكود القديم)
        const blockedDomains = ['llvpn', 'ads', 'pop', 'blank','d0o0d','d0o0d.com', 'updown.icu', 'updown'];

        // الاستهداف المباشر لأزرار السيرفرات بناءً على الهيكل الجديد (بدون الحاجة لطلبات Ajax)
        $('.watch-top .server-btn').each((i, el) => {
            const serverLink = $(el).attr('data-link');

            if (serverLink && serverLink.startsWith('http')) {
                const isBlocked = blockedDomains.some(d => serverLink.includes(d));
                
                if (!isBlocked) {
                    validServers.push({
                        url: serverLink
                    });
                }
            }
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(validServers);

    } catch (error) {
        console.error("خطأ عام:", error.message);
        return res.json([]);
    }
});

// إضافة مسار الدومين الأساسي ليعرض مصفوفة فارغة
app.get('/', (req, res) => {
  res.json([]);
});

// ---------------------------------------------------------
// المسار الخامس: استخراج الحلقة التالية (تم تركه كما هو لعدم وجود تغيير مذكور فيه)
// ---------------------------------------------------------
app.get('/api/next-episode', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([]);

    try {
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([]);

        const html = await response.text();
        const $ = cheerio.load(html);

        const nextElement = $('a.next');

        if (nextElement.length > 0) {
            const nextUrl = nextElement.attr('href') || "";
            const nextNumber = nextElement.find('strong').text().trim() || "";
            const nextTitle = nextElement.find('.txtDiv span').text().trim() || "";

            if (nextUrl) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.json([{
                    title: nextTitle,    
                    number: nextNumber,  
                    url: nextUrl         
                }]);
            }
        }

        return res.json([]);

    } catch (error) {
        console.error("خطأ في استخراج الحلقة التالية:", error.message);
        return res.json([]);
    }
});

module.exports = app;
