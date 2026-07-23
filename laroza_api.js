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

// 🧠 ذاكرة مؤقتة بسيطة لتخزين صور الأفلام لتقليل الطلبات للصفر عند التكرار
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

// ⚡ دالة مساعدة لتقسيم المصفوفة وتنفيذ الطلبات على دفعات متتابعة
async function processInBatches(items, batchSize, asyncFn) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        // تنفيذ الدفعة الحالية بالتوازي
        const batchResults = await Promise.all(batch.map(asyncFn));
        results.push(...batchResults);
    }
    return results;
}

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات (معالج بالدفعات + Timeout + Cache)
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
        
        // مصفوفة مؤقتة لتخزين البيانات الأساسية قبل جلب الصور
        const tempItems = [];

        // استخراج البيانات من الصفحة الرئيسية بحد أقصى 30 عنصر
        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            if (index >= 30) return false; // التوقف عند 30 عنصر

            const box = $(element);
            
            // الرابط الأصلي الذي سندخل عليه لجلب الصورة
            const rawUrl = box.find('a').first().attr('href') || "";
            if (!rawUrl) return true; // تخطي إذا لم يكن هناك رابط

            const fetchUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            
            // الرابط النهائي الذي سيتم عرضه في التطبيق (معدل لـ play.php)
            const movieUrl = formatUrl(rawUrl, baseUrl);
            
            const title = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";
            const eclip_Num = box.find('.pm-label-duration').text().trim() || "";
            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            tempItems.push({
                id, 
                title, 
                url: movieUrl, // الرابط النهائي للتطبيق
                fetchUrl,      // الرابط المؤقت لاستخراج الصورة
                quality, 
                eclip_Num,
                genres: "",
                imdb: ""
            });
        });

        // 🚀 معالجة العناصر على دفعات (8 عناصر فقط في كل مرة لتخفيف الضغط)
        const BATCH_SIZE = 8;
        
        const finalMoviesList = await processInBatches(tempItems, BATCH_SIZE, async (item) => {
            // 1. التحقق أولاً إذا كانت الصورة محفوظة في الذاكرة المؤقتة (Cache)
            if (imageCache.has(item.fetchUrl)) {
                return { ...item, image: imageCache.get(item.fetchUrl), fetchUrl: undefined };
            }

            try {
                // 2. إرسال الطلب مع مهلة أقصاها 2.5 ثانية لكل فيلم تجنباً للمماطلة
                const pageResponse = await fetch(item.fetchUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
                    signal: AbortSignal.timeout(2500) 
                });
                
                const pageHtml = await pageResponse.text();
                const $$ = cheerio.load(pageHtml);
                
                // استخراج الصورة من <link rel="image_src"> أو meta
                let imageUrl = $$('link[rel="image_src"]').attr('href') || 
                               $$('meta[property="og:image"]').attr('content') || "";
                
                // التأكد من أن الرابط كامل
                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = new URL(imageUrl, baseUrl).href;
                }

                // حفظ الصورة في الكاش للمرات القادمة
                if (imageUrl) imageCache.set(item.fetchUrl, imageUrl);

                // إرجاع العنصر بعد إضافة الصورة
                return {
                    id: item.id,
                    title: item.title,
                    url: item.url,
                    image: imageUrl,
                    genres: item.genres,
                    quality: item.quality,
                    imdb: item.imdb,
                    eclip_Num: item.eclip_Num
                };
            } catch (err) {
                // في حال انتهاء الوقت (Timeout) أو حدوث خطأ، نرجع العنصر بدون صورة بدلاً من إيقاف الكود كاملاً
                return {
                    id: item.id,
                    title: item.title,
                    url: item.url,
                    image: "",
                    genres: item.genres,
                    quality: item.quality,
                    imdb: item.imdb,
                    eclip_Num: item.eclip_Num
                };
            }
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

        // استخراج صورة الموسم من الميتا تاج
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
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        // استخراج رقم الموسم
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
        
        // تحديد الـ div المطلوب بناءً على رقم الموسم
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
        
        // 1. نبدأ المصفوفة بالرابط الأساسي ليكون دائماً هو الأول
        const validServers = [{ url: targetUrl }];

        // 2. استخراج الروابط من القائمة
        const listItems = $('ul.WatchList li');
        const blockedDomains = ['llvpn', 'ads', 'pop', 'blank', 'd0o0d', 'updown.icu'];

        listItems.each((index, element) => {
            const li = $(element);
            const iframeSrc = li.attr('data-embed-url') || "";
            const isBlocked = blockedDomains.some(d => iframeSrc.includes(d));

            // نتأكد من عدم إضافة الرابط الأساسي مرة أخرى إذا ظهر في القائمة
            if (iframeSrc && iframeSrc.startsWith('http') && !isBlocked && iframeSrc !== targetUrl) {
                validServers.push({
                    url: iframeSrc
                });
            }
        });

        // 3. الخطة الاحتياطية: إذا لم نجد سيرفرات في القائمة، نبحث عن iframe مباشر
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
        // في حال حدوث خطأ، نرجع الرابط الأساسي فقط لضمان عمل التطبيق
        return res.json([{ url: targetUrl }]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
