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
// المسار الأول: استخراج الأفلام والمسلسلات (باستخدام Cheerio فقط وبدون أخطاء)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept-Language": "ar,en-US;q=0.9,en;q=0.8"
            }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];
        const baseUrl = new URL(targetUrl).origin;

        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            const box = $(element);
            
            // استخراج الرابط وتعديله إلى play.php
            const rawUrl = box.find('a').first().attr('href') || "";
            let movieUrl = rawUrl;
            if (rawUrl) {
                movieUrl = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;
                movieUrl = movieUrl.replace('/video.php?vid=', '/play.php?vid=');
            }
            
            // استخراج العنوان
            const title = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            
            // استخراج الصورة الذكي (البحث في كل السمات وتجاهل base64)
            const imgTag = box.find('img.img-responsive');
            let imageUrl = "";
            const possibleAttrs = ['data-src', 'data-lazy-src', 'data-original', 'src']; // الأماكن المحتملة للصورة
            
            for (let attr of possibleAttrs) {
                const val = imgTag.attr(attr);
                // إذا لقى رابط وما كان بيبدأ برموز الـ base64 بيعتمده وبوقف بحث
                if (val && !val.startsWith('data:image')) {
                    imageUrl = val;
                    break;
                }
            }

            // التأكد من أن رابط الصورة كامل
            if (imageUrl && !imageUrl.startsWith('http')) {
                imageUrl = new URL(imageUrl, baseUrl).href;
            }

            // استخراج الجودة
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";

            // استخراج المدة أو رقم الحلقة
            const eclip_Num = box.find('.pm-label-duration').text().trim() || "";

            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            // تجنب إضافة عناصر فارغة إذا لم يتم العثور على عنوان ورابط
            if (title && movieUrl) {
                moviesList.push({
                    id, 
                    title, 
                    url: movieUrl, 
                    image: imageUrl, 
                    genres: "", 
                    quality, 
                    imdb: "",
                    eclip_Num 
                });
            }
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

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
