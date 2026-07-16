const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الأساسي للرد
const emptyResponse = {
    id: "",
    title: "",
    url: "",
    image: "",
    genres: "",
    quality: "",
    imdb: "",
    eclip_Num: "" // تمت إضافة الحقل الجديد هنا
};

// 1. مسار الأفلام
app.get('/api/page', async (req, res) => {
    // (الكود السابق الخاص بالأفلام يبقى كما هو)
    // ...
});

// 2. مسار المواسم
app.get('/api/seasons', async (req, res) => {
    // (الكود السابق الخاص بالمواسم يبقى كما هو)
    // ...
});

// 3. مسار الحلقات (الجديد)
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

        // استهداف روابط الحلقات
        $('section.allepcont.getMoreByScroll a').each((index, element) => {
            const el = $(element);
            
            const url = el.attr('href') || "";
            const title = el.find('.ep-info h2').text().trim() || "";
            
            // سحب الصورة مع دعم Lazy Load
            const imgTag = el.find('.image img');
            const image = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";
            
            // استخراج رقم الحلقة فقط (تنظيف النص من كلمة "الحلقة" والإبقاء على الأرقام)
            const epNumText = el.find('.epnum').text().trim();
            const eclip_Num = epNumText.replace(/\D/g, '') || ""; 

            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";

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
        });

        if (episodesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(episodesList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
