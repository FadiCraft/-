const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------
// الهيكل الثابت للرد (المطلوب في JSON)
// ---------------------------------------------------------
const emptyResponse = {
  title: "",
  link: "",
  image: "",
  quality: "",
  category: "",
  views: "",
  imdb: "",
  type: ""
};

// ---------------------------------------------------------
// دالة مشتركة لمعالجة الـ Headers
// ---------------------------------------------------------
const getHeaders = (targetUrl) => {
    try {
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
    } catch (e) {
        return {}; // ارجاع هيدر فارغ في حال كان الرابط غير صالح لمنع توقف السيرفر
    }
};

// ---------------------------------------------------------
// دالة مشتركة لاستخراج البيانات من أي بطاقة (postDiv)
// ---------------------------------------------------------
const extractDataFromElement = (box, $) => {
    const url = box.find('a').first().attr('href') || "";
    const title = box.find('div.h1').text().trim() || "";
    
    // استخراج الصورة
    const imgTag = box.find('img');
    const image = imgTag.attr('data-src') || imgTag.attr('src') || "";
    
    // استخراج الجودة (أحياناً تكون نص "موسم واحد" أو جودة "1080p")
    let quality = box.find('span.quality').text().replace(/\s+/g, ' ').trim() || "";
    
    // استخراج التصنيفات (Genres) ودمجها
    const categoriesArray = [];
    box.find('span.cat').each((i, el) => {
        categoriesArray.push($(el).text().trim());
    });
    const category = categoriesArray.join(' - ');
    
    // استخراج المشاهدات
    let views = box.find('span.pViews').text().trim();
    // إزالة كلمة "مشاهدة" أو أي مسافات زائدة إذا وجدت، والاحتفاظ بالرقم فقط
    views = views ? views.replace(/[^0-9٬,]/g, '').trim() : "";

    // استخراج تقييم IMDB
    let imdb = box.find('span.pImdb').text().trim();
    // إذا لم يكن موجوداً بـ class pImdb، نبحث عن أي span يحتوي على أيقونة النجمة
    if (!imdb) {
        const starSpan = box.find('span').filter(function() {
            return $(this).find('i.fa-star').length > 0;
        });
        if (starSpan.length > 0) {
            imdb = starSpan.text().trim();
        }
    }
    // تنظيف نص الـ IMDB ليتبقى الرقم فقط
    imdb = imdb ? imdb.replace(/[^\d.]/g, '').trim() : "";

    // استنتاج نوع العمل بناءً على العنوان أو الرابط
    let type = "";
    if (url.includes('/movies/') || title.includes('فيلم')) {
        type = "فيلم";
    } else if (url.includes('/seasons/') || url.includes('/asian_seasons/') || title.includes('مسلسل')) {
        type = "مسلسل";
    } else if (url.includes('/anime/') || title.includes('انمي')) {
        type = "انمي";
    } else if (url.includes('/tvseasons/') || title.includes('برنامج')) {
        type = "برنامج";
    } else {
        type = "غير معروف";
    }

    if (title && url) {
        return {
            title: title,
            link: url,
            image: image,
            quality: quality,
            category: category,
            views: views,
            imdb: imdb,
            type: type
        };
    }
    return null;
};

// ---------------------------------------------------------
// المسار الأول: api/page (لجلب الأحدث - الأفلام، المسلسلات، الأنمي، البرامج)
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: getHeaders(targetUrl)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const list = [];

        // استهداف الكلاس الخاص بالأحدث (الذي يكون عادة داخل Grid bootstrap مثل col-xl-2)
        // تجاهل العناصر التي بداخل .owl-item (لأنها خاصة بالأشهر/السلايدر)
        $('div.col-xl-2 div.postDiv').each((index, element) => {
            const data = extractDataFromElement($(element), $);
            if (data) list.push(data);
        });

        if (list.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(list);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// المسار الثاني: api/pagetop (لجلب الأشهر / السلايدر العلوي)
// ---------------------------------------------------------
app.get('/api/pagetop', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: getHeaders(targetUrl)
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const list = [];

        // استهداف العناصر الموجودة فقط داخل السلايدر (الأكثر شهرة)
        $('div.owl-item div.postDiv').each((index, element) => {
            const data = extractDataFromElement($(element), $);
            if (data) list.push(data);
        });

        if (list.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(list);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
