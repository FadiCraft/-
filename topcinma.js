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
// المسار الأول: استخراج الأفلام والمسلسلات (يدعم الهيكلين القديم والجديد)
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

        // استهداف الكلاس القديم (div.entry-box) والكلاس الجديد (.item__contents)
        $('div.entry-box, .item__contents').each((index, element) => {
            const box = $(element);
            
            // استخراج الرابط (من الهيكل الجديد أو القديم)
            const movieUrl = box.find('a.movie__block').attr('href') || 
                             box.find('h3 a').attr('href') || 
                             box.find('.entry-image a').attr('href') || 
                             box.find('> a').attr('href') || "";
            
            // استخراج العنوان
            const title = box.find('.post__info h3').text().trim() || 
                          box.find('h3 a').text().trim() || 
                          box.find('a.movie__block').attr('title') || "";
            
            // استخراج الصورة
            const imgTag = box.find('.post__image img, .entry-image img');
            const imageUrl = imgTag.attr('data-src') || 
                             imgTag.attr('data-lazy-src') || 
                             imgTag.attr('src') || "";

            // استخراج رقم الحلقة
            let eclip_Num = "";
            const newSeriesLabel = box.find('.__number').text().trim(); // الهيكل الجديد
            const oldSeriesLabel = box.find('.label.series').text().trim(); // الهيكل القديم
            
            const seriesText = newSeriesLabel || oldSeriesLabel;
            if (seriesText) {
                // استخراج الأرقام فقط وإضافة كلمة "حلقة"
                const num = seriesText.replace(/\D/g, '');
                if(num) eclip_Num = "حلقة " + num; 
            }

            // استخراج التصنيف (تمت إضافة تنظيف للمسافات والأسطر الفارغة لتناسب الهيكل الجديد)
            let genre = box.find('.post__category, .badge-light').text().trim();
            genre = genre.replace(/\s+/g, ' ').trim() || ""; 

            // استخراج الجودة (أخذ أول جودة في حال وجود أكثر من واحدة في الهيكل الجديد)
            let quality = box.find('.__quality, .badge-secondary').first().text().trim() || ""; 

            // استخراج تقييم IMDB (إن وجد)
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
// المسار الثاني: استخراج المواسم (دعم الهيكل الجديد مع إضافة موسم وهمي إذا لم توجد مواسم)
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

        // استخراج الصورة العامة للمسلسل/الموسم من الميتا تاج لتطبيقها على المواسم
        const metaImage = $('meta[name="twitter:image"]').attr('content') || 
                          $('meta[property="og:image"]').attr('content') || 
                          "";

        // 1. محاولة استخراج المواسم من القائمة الجانبية (الهيكل الجديد والقديم)
        $('#series-episodes .widget-body a.btn, #series-episodes .widget-body > a').each((index, element) => {
            const el = $(element);
            const seasonUrl = el.attr('href') || "";
            const title = el.text().trim() || "";
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            if (title && seasonUrl) {
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
            }
        });

        // 2. طبقة حماية احتياطية: البحث عن أي رابط يحتوي على "الموسم" و "series"
        if(seasonsList.length === 0){
             $('a:contains("الموسم")').each((index, element) => {
                const el = $(element);
                const seasonUrl = el.attr('href') || "";
                let title = el.text().trim() || "";
                
                if (title.length > 50) return; 

                const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

                if (title && seasonUrl && seasonUrl.includes('series')) {
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
                }
             });
        }

        // 3. الفكرة الجديدة: إذا لم يتم العثور على أي مواسم، نقوم بإنشاء "موسم وهمي"
        if (seasonsList.length === 0) {
            // نتحقق أولاً أن الصفحة تحتوي فعلاً على حلقات (حتى لا ننشئ موسم لفيلم أو صفحة فارغة)
            const hasEpisodes = $('div.bg-primary2').length > 0 || $('.item__contents.is__episode').length > 0;
            
            if (hasEpisodes) {
                const fakeId = crypto.createHash('md5').update(targetUrl).digest('hex');
                seasonsList.push({
                    id: fakeId,
                    title: "الموسم الاول", // اسم الموسم الوهمي
                    url: targetUrl, // نمرر نفس رابط الصفحة الحالية
                    image: metaImage,
                    genres: "",
                    quality: "",
                    imdb: "",
                    eclip_Num: "" 
                });
            }
        }

        if (seasonsList.length === 0) return res.json([emptyResponse]);

        // إزالة التكرارات إن وجدت بناءً على الرابط
        const uniqueSeasons = Array.from(new Map(seasonsList.map(item => [item.url, item])).values());

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(uniqueSeasons);

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
