const express = require('express');
const cheerio = require('cheerio');
const crypto = require('crypto');
const puppeteer = require('puppeteer'); // تم نقلها للأعلى لتنظيم الكود

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// الهيكل الثابت الموحد لجميع المسارات مع إضافة حقل رقم الحلقة
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

// ---------------------------------------------------------
// المسار الأول: استخراج الأفلام
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

        $('div.Small--Box:not(.Season)').each((index, element) => {
            const box = $(element);
            const movieUrl = box.find('a.recent--block').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            
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
                        if (!genre) genre = text;
                    }
                }
            });

            const id = movieUrl ? crypto.createHash('md5').update(movieUrl).digest('hex') : "";

            moviesList.push({
                id, 
                title, 
                url: movieUrl, 
                image: imageUrl, 
                genres: genre, 
                quality, 
                imdb: imdbRating,
                eclip_Num: "" // فارغ في حالة الأفلام
            });
        });

        if (moviesList.length === 0) return res.json([emptyResponse]);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(moviesList);
    } catch (error) {
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

        $('section.allseasonss div.Small--Box.Season').each((index, element) => {
            const box = $(element);

            const seasonUrl = box.find('a').attr('href') || "";
            const title = box.find('h3.title').text().trim() || "";
            
            const imgTag = box.find('div.Poster img');
            const imageUrl = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";

            const id = seasonUrl ? crypto.createHash('md5').update(seasonUrl).digest('hex') : "";

            seasonsList.push({
                id: id,
                title: title,
                url: seasonUrl,
                image: imageUrl,
                genres: "",
                quality: "",
                imdb: "",
                eclip_Num: "" // فارغ في حالة المواسم
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
        const response = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const $ = cheerio.load(html);
        const episodesList = [];

        // استهداف روابط الحلقات من داخل الكلاس المخصص
        $('section.allepcont.getMoreByScroll a').each((index, element) => {
            const el = $(element);
            
            const url = el.attr('href') || "";
            const title = el.find('.ep-info h2').text().trim() || "";
            
            // استخراج الصورة مع دعم التحميل المتأخر (Lazy Load)
            const imgTag = el.find('.image img');
            const image = imgTag.attr('data-src') || imgTag.attr('data-lazy-src') || imgTag.attr('src') || "";
            
            // استخراج رقم الحلقة فقط
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

// ---------------------------------------------------------
// المسار الرابع: استخراج رابط السيرفر (iframe) السريع والمباشر
// ---------------------------------------------------------
app.get('/api/watch', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.send("");
    if (!targetUrl.endsWith('/watch/')) targetUrl = targetUrl.replace(/\/$/, '') + '/watch/';

    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        // تعطيل كل شيء غير ضروري
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        const servers = await page.$$eval('li.server--item', els => 
            els.map((el, i) => ({ index: i, text: el.innerText }))
               .filter(s => !s.text.includes('متعدد الجودات'))
        );

        let finalUrl = "";

        for (const s of servers) {
            // "الاستماع" لرد السيرفر قبل الضغط
            const responsePromise = page.waitForResponse(response => 
                response.url().includes('admin-ajax.php') || response.status() === 200
            );

            const elements = await page.$$('li.server--item');
            await elements[s.index].click();

            try {
                // الانتظار فقط حتى يأتي الرد (أسرع من الانتظار الثابت)
                const response = await responsePromise;
                const text = await response.text();
                
                // البحث عن الرابط داخل الرد
                const match = text.match(/https?:\/\/[^\s"']+/);
                if (match && (match[0].includes('embed') || match[0].includes('vidtube'))) {
                    finalUrl = match[0];
                    break;
                }
            } catch (e) { continue; }
        }

        await browser.close();
        res.setHeader('Content-Type', 'text/plain');
        res.send(finalUrl || "");

    } catch (e) {
        if (browser) await browser.close();
        res.send("");
    }
});
// ---------------------------------------------------------
// تشغيل السيرفر
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});
