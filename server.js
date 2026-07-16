const cheerio = require('cheerio');

// الرابط المراد كشطه
const url = "https://topcinma.com/movies/";

async function scrapeMovies() {
    try {
        console.log("جاري استخراج البيانات من الموقع... برجاء الانتظار");

        // إرسال طلب للموقع باستخدام fetch المدمج في Node.js v24
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        
        // تحميل محتوى الصفحة بواسطة cheerio (بديل BeautifulSoup)
        const $ = cheerio.load(html);
        const moviesList = [];

        // البحث عن جميع الصناديق الخاصة بالأفلام بناءً على الكلاس
        $('div.Small--Box').each((index, element) => {
            const box = $(element);

            // 1. استخراج الرابط الأساسي للفيلم
            const movieUrl = box.find('a.recent--block').attr('href') || null;

            // 2. استخراج العنوان
            const title = box.find('h3.title').text().strip || box.find('h3.title').text().trim() || null;

            // 3. استخراج رابط بوستر الفيلم (الصورة)
            const imageUrl = box.find('div.Poster img').attr('src') || null;

            // 4. استخراج تفاصيل القائمة (النوع، الجودة، التقييم)
            const genres = [];
            let quality = null;
            let imdbRating = null;

            box.find('ul.liList li').each((i, li) => {
                const text = $(li).text().trim();

                // التحقق إذا كان العنصر يحتوي على كلاس التقييم
                if ($(li).hasClass('imdbRating')) {
                    imdbRating = text; // سيستخرج التقييم مثل: 4.9
                } else {
                    // تمييز الجودة عن التصنيف باستخدام التعبيرات النمطية (Regex)
                    if (/p|web|bluray|hd|cam/i.test(text)) {
                        quality = text;
                    } else {
                        genres.push(text); // إضافة التصنيف مثل (دراما)
                    }
                }
            });

            // تجميع البيانات بشكل مرتب في كائن (Object)
            moviesList.push({
                title,
                url: movieUrl,
                poster_image: imageUrl,
                genres,
                quality,
                imdb_rating: imdbRating
            });
        });

        // طباعة النتيجة بتنسيق JSON مقروء ومنظم
        console.log(JSON.stringify(moviesList, null, 4));
        return moviesList;

    } catch (error) {
        console.error("حدث خطأ أثناء استخراج البيانات:", error.message);
        return [];
    }
}

// تشغيل الدالة
scrapeMovies();
