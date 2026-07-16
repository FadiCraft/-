const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// السماح بمرور البيانات باللغة العربية بشكل صحيح
app.use(express.json());

// تغيير المسار ليستقبل الرابط المتغير
app.get('/api/page', async (req, res) => {
    // استخراج الرابط من الـ Query Parameter (url)
    const targetUrl = req.query.url;

    // التحقق من أن المستخدم قام بإرسال الرابط فعلاً
    if (!targetUrl) {
        return res.status(400).json({ 
            error: "برجاء تزويد الرابط المطلوب كشطه", 
            example: "/api/page?url=https://topcinma.com/movies/" 
        });
    }

    try {
        // إرسال طلب للرابط الديناميكي المرسل
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) {
            return res.status(500).json({ error: `فشل الاتصال بالموقع المستهدف: ${response.status}` });
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];

        // استخراج البيانات بنفس الهيكلية المرتبة
        $('div.Small--Box').each((index, element) => {
            const box = $(element);

            const movieUrl = box.find('a.recent--block').attr('href') || null;
            const title = box.find('h3.title').text().trim() || null;
            const imageUrl = box.find('div.Poster img').attr('src') || null;

            const genres = [];
            let quality = null;
            let imdbRating = null;

            box.find('ul.liList li').each((i, li) => {
                const text = $(li).text().trim();

                if ($(li).hasClass('imdbRating')) {
                    imdbRating = text;
                } else {
                    if (/p|web|bluray|hd|cam/i.test(text)) {
                        quality = text;
                    } else {
                        genres.push(text);
                    }
                }
            });

            moviesList.push({
                title,
                url: movieUrl,
                poster_image: imageUrl,
                genres,
                quality,
                imdb_rating: imdbRating
            });
        });

        // إرجاع النتيجة
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

    } catch (error) {
        res.status(500).json({ error: "حدث خطأ داخلي في السيرفر أو الرابط غير صحيح", details: error.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
