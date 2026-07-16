const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

    if (!targetUrl) {
        return res.json([emptyResponse]);
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) {
            return res.json([emptyResponse]);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const moviesList = [];

        $('div.Small--Box').each((index, element) => {
            const box = $(element);

            const movieUrl = box.find('a.recent--block').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            
            // التعديل هنا: سحب الصورة من خصائص الـ Lazy Load أولاً
            const imgTag = box.find('div.Poster img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            let genre = "";
            let quality = "";
            let imdbRating = "";

            box.find('ul.liList li').each((i, li) => {
                const text = $(li).text().trim();

                if ($(li).hasClass('imdbRating')) {
                    imdbRating = text.replace(/[^\d.]/g, ''); 
                } else {
                    if (/p|web|bluray|hd|cam/i.test(text)) {
                        quality = text;
                    } else {
                        if (!genre) {
                            genre = text;
                        }
                    }
                }
            });

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

        if (moviesList.length === 0) {
            return res.json([emptyResponse]);
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);

    } catch (error) {
        res.json([emptyResponse]);
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
