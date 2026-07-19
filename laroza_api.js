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

// دالة مساعدة لتنظيف وتعديل الروابط (تغيير video إلى play)
function formatUrl(url, baseUrl) {
    if (!url) return "";
    // تحويل الرابط النسبي إلى رابط كامل إذا لزم الأمر
    let fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
    // استبدال video.php بـ play.php كما طلبت
    return fullUrl.replace('/video.php?vid=', '/play.php?vid=');
}

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام والمسلسلات
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
        const baseUrl = new URL(targetUrl).origin;

        $('li.col-xs-6.col-sm-4.col-md-3').each((index, element) => {
            const box = $(element);
            
            // استخراج الرابط وتعديله
            let rawUrl = box.find('a').first().attr('href') || "";
            // إذا كان في الرئيسية غالبا الرابط لمسلسل كامل يكون للموسم الأول، سنتركه كما هو أو نعدله
            let movieUrl = formatUrl(rawUrl, baseUrl);
            
            // استخراج العنوان
            const title = box.find('.caption h3 a').text().trim() || box.find('a').first().attr('title') || "";
            
            // استخراج الصورة
            const imgTag = box.find('img.img-responsive');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('src') || "";

            // الجودة
            const quality = box.find('.pm-video-labels .hot').text().trim() || "";

            // استخراج المدة أو رقم الحلقة (إن وجد)
            const durationOrEp = box.find('.pm-label-duration').text().trim() || "";
            const eclip_Num = durationOrEp; // يمكنك فلترتها لاحقاً إذا أردت

            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

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
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);
    } catch (error) {
        console.error(error);
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

        // استخراج المواسم
        $('div.SeasonsBoxUL ul li').each((index, element) => {
            const li = $(element);
            const seasonNumber = li.attr('data-serie') || "";
            const title = li.text().trim() || `الموسم ${seasonNumber}`;
            
            // الخدعة هنا: نمرر نفس رابط الصفحة ولكن نضيف له رقم الموسم
            // لكي يستطيع مسار الحلقات لاحقاً قراءته واستخراج القسم الخاص به
            const seasonUrl = `${targetUrl}&season_id=${seasonNumber}`;
            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id: id,
                title: title,
                url: seasonUrl,
                image: "", // لا يوجد صور للمواسم في الهيكل الجديد
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

    // استخراج رقم الموسم الذي مررناه في مسار المواسم
    let seasonId = "1"; // الافتراضي
    if (targetUrl.includes('&season_id=')) {
        const urlParts = targetUrl.split('&season_id=');
        targetUrl = urlParts[0]; // الرابط الأصلي للصفحة
        seasonId = urlParts[1]; // رقم الموسم
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

        // استهداف الحلقات التابعة للموسم المحدد فقط
        $(`div.SeasonsEpisodes[data-serie="${seasonId}"] a`).each((index, element) => {
            const aTag = $(element);
            
            const rawUrl = aTag.attr('href') || "";
            const url = formatUrl(rawUrl, baseUrl); // تعديل الرابط ليكون play.php
            
            const title = aTag.attr('title') || "";
            const epNum = aTag.find('em').text().trim() || ""; // رقم الحلقة

            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";

            episodesList.push({
                id: id,
                title: title,
                url: url,
                image: "", // لا يوجد صور للحلقات في الهيكل الجديد
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
// المسار الرابع: استخراج السيرفرات (تم تبسيطه جداً بناء على الهيكل الجديد)
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

        // السيرفرات في الموقع الجديد موجودة مباشرة داخل data-embed-url
        $('ul.WatchList li').each((index, element) => {
            const li = $(element);
            const iframeSrc = li.attr('data-embed-url') || "";
            const serverName = li.find('strong').text().trim() || `سيرفر ${index + 1}`;

            const blockedDomains = ['llvpn', 'ads', 'pop', 'blank', 'd0o0d', 'updown.icu'];
            const isBlocked = blockedDomains.some(d => iframeSrc.includes(d));

            if (iframeSrc && iframeSrc.startsWith('http') && !isBlocked) {
                validServers.push({
                    name: serverName, // أضفت اسم السيرفر ليكون أفضل لك في العرض
                    url: iframeSrc
                });
            }
        });

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (validServers.length > 0) {
            return res.json(validServers);
        } else {
            // كود بديل إذا كان هناك iframe مباشر في الصفحة (احتياطي)
            const directIframe = $('iframe').first().attr('src');
            if (directIframe && directIframe.startsWith('http')) {
                 return res.json([{ name: "سيرفر رئيسي", url: directIframe }]);
            }
            return res.json([]);
        }

    } catch (error) {
        console.error("خطأ استخراج السيرفرات:", error.message);
        return res.json([]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
