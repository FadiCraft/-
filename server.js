const express = require('express');
const cheerio = require('cheerio');

const app = express();
// Render يمرر المنفذ تلقائياً عبر متغيرات البيئة process.env.PORT
const PORT = process.env.PORT || 3000;

const targetUrl = "https://topcinma.com/movies/";

// السماح بمرور البيانات باللغة العربية بشكل صحيح
app.use(express.json());

// الرابط الأساسي للموقع عند فتحه على Render
app.get('/', async (req, res) => {
    try {
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

        // استخراج البيانات بناءً على الكود الخاص بك
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

        // إرجاع النتيجة للمتصفح أو للتطبيق الخاص بك
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

    } catch (error) {
        res.status(500).json({ error: "حدث خطأ داخلي في السيرفر", details: error.message });
    }
});

// بدء تشغيل السيرفر والاستماع للمنفذ
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
