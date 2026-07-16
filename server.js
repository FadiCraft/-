const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto'); // مكتبة مدمجة في Node.js لإنشاء المعرفات

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الثابت في حال وجود خطأ أو عدم وجود بيانات
const emptyResponse = {
    id: "",
    title: "",
    url: "",
    image: "",
    genres: "",
    quality: "",
    imdb: ""
};

app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;

    // في حال لم يقم المستخدم بإرسال الرابط
    if (!targetUrl) {
        return res.json([emptyResponse]);
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            }
        });

        // في حال كان الموقع معطلاً أو الرابط خاطئاً
        if (!response.ok) {
            return res.json([emptyResponse]);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];

        $('div.Small--Box').each((index, element) => {
            const box = $(element);

            // استخراج القيم الأساسية أو تركها فارغة
            const movieUrl = box.find('a.recent--block').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            const imageUrl = box.find('div.Poster img').attr('src') || "";

            let genre = "";
            let quality = "";
            let imdbRating = "";

            box.find('ul.liList li').each((i, li) => {
                const text = $(li).text().trim();

                if ($(li).hasClass('imdbRating')) {
                    // استخراج الرقم الخاص بالتقييم فقط
                    imdbRating = text.replace(/[^\d.]/g, ''); 
                } else {
                    if (/p|web|bluray|hd|cam/i.test(text)) {
                        quality = text;
                    } else {
                        // أخذ تصنيف واحد فقط وتجاهل البقية
                        if (!genre) {
                            genre = text;
                        }
                    }
                }
            });

            // إنشاء معرف (ID) فريد وثابت بناءً على رابط الفيلم
            // هكذا نضمن أن المعرف غير عشوائي وثابت لنفس الفيلم دائماً
            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            moviesList.push({
                id: id,
                title: title,
                url: movieUrl,
                image: imageUrl,
                genres: genre,
                quality: quality,
                imdb: imdbRating
            });
        });

        // إذا كانت الصفحة فارغة ولا يوجد بها أفلام
        if (moviesList.length === 0) {
            return res.json([emptyResponse]);
        }

        // إرجاع البيانات بنجاح
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

    } catch (error) {
        // في حال حدوث أي خطأ برمجي يتم إرجاع الهيكل الفارغ
        res.json([emptyResponse]);
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
