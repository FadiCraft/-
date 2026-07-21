const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الموحد للرد
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

// دالة لتوليد الترويسات (Headers) لتجاوز الحظر
const getHeaders = (targetUrl) => {
    const urlObj = new URL(targetUrl);
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        "Connection": "keep-alive",
        "Referer": urlObj.origin + "/", 
        "Origin": urlObj.origin,
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };
};

// ---------------------------------------------------------
// مسار استخراج الأفلام من الهيكل الجديد
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) return res.json([emptyResponse]);

    try {
        // جلب الصفحة مع حقن الترويسات
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: getHeaders(targetUrl)
        });

        if (!response.ok) {
            console.error(`خطأ في الاتصال: ${response.status}`);
            return res.json([emptyResponse]);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];

        // استهداف الكلاس الرئيسي للعنصر في الهيكل الجديد
        $('div.postDiv').each((index, element) => {
            const box = $(element);
            
            // 1. استخراج الرابط
            const url = box.find('a').attr('href') || "";
            
            // 2. توليد ID من الرابط
            const id = url ? crypto.createHash('md5').update(url).digest('hex') : "";
            
            // 3. استخراج الصورة (استخدام data-src ثم src كبديل)
            const imgTag = box.find('div.imgdiv-class img');
            const image = imgTag.attr('data-src') || imgTag.attr('src') || "";
            
            // 4. استخراج العنوان
            const title = box.find('div.h1').text().trim() || "";
            
            // 5. استخراج الجودة
            const quality = box.find('span.quality').text().trim() || "";
            
            // 6. استخراج التصنيفات (Genres) ودمجها بفاصلة أو شرطة
            const genresArray = [];
            box.find('span.cat').each((i, el) => {
                genresArray.push($(el).text().trim());
            });
            const genres = genresArray.join(' - '); // ستصبح: اكشن - دراما - مغامرات
            
            // بما أن هذا هيكل فيلم، رقم الحلقة وتقييم IMDB غير موجودين في هذا الكود تحديداً
            const eclip_Num = ""; 
            const imdb = "";

            // إضافة العنصر إلى المصفوفة
            if (title && url) {
                moviesList.push({
                    id,
                    title,
                    url,
                    image,
                    genres,
                    quality,
                    imdb,
                    eclip_Num
                });
            }
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

    } catch (error) {
        console.error("خطأ أثناء الاستخراج:", error.message);
        res.json([emptyResponse]);
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
