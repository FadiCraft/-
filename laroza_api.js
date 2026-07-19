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
// المسار الأول: استخراج الأفلام والمسلسلات (بالدخول لصفحة الفيلم لجلب الصورة)
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

        // الدخول لصفحات الأفلام كلها في نفس الوقت لجلب الصورة (سريع جداً)
        const finalMoviesList = await Promise.all(tempItems.map(async (item) => {
            try {
                const pageResponse = await fetch(item.fetchUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                });
                
                const pageHtml = await pageResponse.text();
                const $$ = cheerio.load(pageHtml);
                
                // استخراج الصورة من <link rel="image_src"> كما طلبت
                let imageUrl = $$('link[rel="image_src"]').attr('href') || 
                               $$('meta[property="og:image"]').attr('content') || "";
                
                // التأكد من أن الرابط كامل
                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = new URL(imageUrl, baseUrl).href;
                }

                // إرجاع العنصر بعد إضافة الصورة وإزالة رابط الـ fetchUrl المؤقت
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
                // في حال فشل جلب صورة فيلم معين، نرجع العنصر بدون صورة بدلاً من إيقاف الكود كاملاً
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
        }));

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
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        // استخراج رقم الموسم من الرابط (season_id)
        const urlObj = new URL(targetUrl);
        const seasonId = urlObj.searchParams.get('season_id');
        const baseUrl = urlObj.origin;

        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        
        // جلب صورة المسلسل لتكون هي نفسها صورة الحلقات
        let imageUrl = $('link[rel="image_src"]').attr('href') || $('meta[property="og:image"]').attr('content') || "";
        if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, baseUrl).href;
        }

        const episodesList = [];
        
        // تحديد الـ div المطلوب بناءً على رقم الموسم، وإذا لم يكن هناك رقم سيبحث عن أول قسم حلقات كإجراء احتياطي
        let episodesContainer;
        if (seasonId) {
            episodesContainer = $(`div.SeasonsEpisodes[data-serie="${seasonId}"]`);
        } else {
            episodesContainer = $('div.SeasonsEpisodes').first();
        }

        // استخراج الحلقات من داخل الـ div المحدد فقط
        episodesContainer.find('a').each((i, el) => {
            const aTag = $(el);
            let rawUrl = aTag.attr('href') || "";
            
            if (!rawUrl) return true; // تخطي إذا لم يوجد رابط

            // تحويل الرابط إلى play.php ليعمل داخل التطبيق
            let episodeUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
            episodeUrl = episodeUrl.replace('/video.php?vid=', '/play.php?vid=');

            // استخراج العنوان
            const title = aTag.attr('title') || aTag.text().trim() || "";
            
            // استخراج رقم الحلقة من وسم <em>
            const epNumText = aTag.find('em').text().trim();
            const eclip_Num = epNumText ? `الحلقة ${epNumText}` : "";

            // توليد آيدي فريد للحلقة
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
