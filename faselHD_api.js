const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

// دالة مشتركة لمعالجة الـ Headers
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
        return {};
    }
};

// الدالة المركزية التي تستخرج البيانات باستخدام الـ Regex الخاص بك
const extractData = (html) => {
    const topList = [];
    const newList = [];
    const topLinks = new Set();

    const pCleanup = /&#8211;|–|&#\d+;|&amp;/g;
    const pHtmlEntity = /&[^\s;]+;/g;

    // تقسيم HTML إلى أقسام تماماً كما في الجافا
    const sections = html.split(/<section|<div class="container">|<div class="headWfilter">/i);

    for (let i = 1; i < sections.length; i++) {
        let secHTML = sections[i];
        let secTitle = "";

        // البحث عن عنوان القسم
        let mt = secHTML.match(/class="[^"]*h4[^"]*">\s*([^<]+?)\s*</i);
        if (mt) secTitle = mt[1].trim();

        if (!secTitle) {
            mt = secHTML.match(/class="[^"]*h3[^"]*">\s*([^<]+?)\s*</i);
            if (mt) secTitle = mt[1].trim();
        }

        if (!secTitle) {
            mt = secHTML.match(/<div class="subHead">[\s\S]*?<div class="h4">\s*([^<]+?)\s*</i);
            if (mt) secTitle = mt[1].trim();
        }

        if (!secTitle) continue;

        const isTopSection = secTitle.includes("الاكثر مشاهدة") || secTitle.includes("الأكثر مشاهدة");
        const isNewSection = secTitle.includes("احدث") || secTitle.includes("أحدث") || 
                             secTitle.includes("جميع") || secTitle.includes("المسلسلات") ||
                             secTitle.includes("الافلام") || secTitle.includes("الأفلام") ||
                             secTitle.includes("البرامج") || secTitle.includes("الأنمي") ||
                             secTitle.includes("الانمي");

        if (isTopSection || isNewSection) {
            let type = "";
            if (secTitle.includes("برنامج") || secTitle.includes("البرامج")) type = "برنامج";
            else if (secTitle.includes("أنمي") || secTitle.includes("انمي") || secTitle.includes("الأنمي") || secTitle.includes("الانمي")) type = "انمي";
            else if (secTitle.includes("مسلسل") || secTitle.includes("المسلسلات")) type = "مسلسل";
            else if (secTitle.includes("فيلم") || secTitle.includes("افلام") || secTitle.includes("أفلام")) type = "فيلم";
            else if (secTitle.includes("اسيوي") || secTitle.includes("أسيوي") || secTitle.includes("الآسيوية")) type = "اسيوي";

            // استخراج العناصر
            const itemRegex = /<div class="postDiv\s*">([\s\S]*?)<\/div>\s*<\/div>/gi;
            let mItem;
            
            while ((mItem = itemRegex.exec(secHTML)) !== null) {
                let fullItem = mItem[0];
                let link = "";
                
                let mL = fullItem.match(/<a href="([^"]+)"/i);
                if (mL) link = mL[1];

                // التحقق من التكرار في التوب
                if (isTopSection && topLinks.has(link)) continue;
                if (isTopSection) topLinks.add(link);

                let title = "";
                let mT = fullItem.match(/alt="([^"]+)"/i);
                if (mT) {
                    title = mT[1].replace(pCleanup, "").replace(pHtmlEntity, "").trim();
                }

                let img = "";
                let mI = fullItem.match(/data-src="([^"]+)"/i);
                if (mI) img = mI[1];

                let quality = "";
                let episodes = "";
                // جلب كل كلاسات quality
                let qMatches = [...fullItem.matchAll(/class="quality">\s*([^<]+?)\s*</gi)];
                if (qMatches.length > 0) {
                    quality = qMatches[0][1].trim(); // الأول للجودة
                }
                if (qMatches.length > 1) {
                    let secondQuality = qMatches[1][1].trim();
                    if (secondQuality.includes("حلقة")) episodes = secondQuality; // الثاني للحلقات
                }

                let category = "";
                let mC = fullItem.match(/class="cat">([^<]+)</i);
                if (mC) category = mC[1].trim();

                let views = "";
                let mV = fullItem.match(/class="pViews"[^>]*>[\s\S]*?<\s*\/\s*i\s*>\s*([^<]+?)\s*</i);
                if (mV) views = mV[1].trim();

                let imdb = "";
                let mIm = fullItem.match(/class="pImdb"[^>]*>[\s\S]*?<\s*\/\s*i\s*>\s*([^<]+?)\s*</i);
                if (mIm) {
                    imdb = mIm[1].trim();
                } else {
                    mIm = fullItem.match(/<span>\s*<i\s+class="fa fa-star"><\/i>\s*([^<]+?)\s*</i);
                    if (mIm) imdb = mIm[1].trim();
                }

                const jsonItem = {
                    title,
                    link,
                    image: img,
                    quality,
                    category,
                    views,
                    imdb,
                    type
                };
                
                if (episodes) jsonItem.episodes = episodes; // إضافة الحلقات للأنمي فقط إن وجدت

                if (isTopSection) {
                    topList.push(jsonItem);
                    if (topList.length >= 10) break; // إيقاف عند 10 كحد أقصى كما في كودك
                } else {
                    newList.push(jsonItem);
                }
            }
        }
    }

    return { topList, newList };
};

// ---------------------------------------------------------
// مسار جلب الأحدث
// ---------------------------------------------------------
app.get('/api/page', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, { headers: getHeaders(targetUrl) });
        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const data = extractData(html);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(data.newList.length > 0 ? data.newList : [emptyResponse]);
    } catch (error) {
        res.json([emptyResponse]);
    }
});

// ---------------------------------------------------------
// مسار جلب الأشهر (Top)
// ---------------------------------------------------------
app.get('/api/pagetop', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.json([emptyResponse]);

    try {
        const response = await fetch(targetUrl, { headers: getHeaders(targetUrl) });
        if (!response.ok) return res.json([emptyResponse]);

        const html = await response.text();
        const data = extractData(html);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(data.topList.length > 0 ? data.topList : [emptyResponse]);
    } catch (error) {
        res.json([emptyResponse]);
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
