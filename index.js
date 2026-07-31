const express = require('express');
const app = express();

app.set('json spaces', 2);

// 1. دالة استخراج الروابط من استجابة الـ API
function extractValidDownloads(data) {
    let validDownloads = [];

    function search(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(item => search(item));
        } else if (obj !== null && typeof obj === 'object') {
            if (obj.download_url && obj.download_url.trim() !== "") {
                validDownloads.push({
                    format: (obj.format || "Unknown").toUpperCase(),
                    quality: (obj.quality || "Unknown").toUpperCase(),
                    download_url: obj.download_url
                });
            }
            Object.values(obj).forEach(val => search(val));
        }
    }

    search(data);
    return validDownloads;
}

// 2. دالة لاستبقاء أفضل ملف MP3 فقط
function keepBestMp3Only(downloads) {
    const mp3Files = downloads.filter(d => d.format.includes('MP3') || d.format.includes('AUDIO'));
    const otherFiles = downloads.filter(d => !d.format.includes('MP3') && !d.format.includes('AUDIO'));

    if (mp3Files.length > 0) {
        // ترتيب الـ MP3 حسب الجودة (استخراج الرقم وترتيبه تنازلياً)
        mp3Files.sort((a, b) => {
            let qualityA = parseInt(a.quality.replace(/\D/g, '')) || 0;
            let qualityB = parseInt(b.quality.replace(/\D/g, '')) || 0;
            return qualityB - qualityA; 
        });

        // الاحتفاظ بأفضل جودة فقط
        otherFiles.push(mp3Files[0]);
    }

    return otherFiles;
}

// 3. دالة ذكية لفحص الرابط بدون التسبب برفض السيرفرات (المشكلة السابقة)
async function checkUrlIsAlive(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // إيقاف الفحص بعد 6 ثوانٍ

        // نستخدم HEAD لطلب حالة الملف فقط
        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // نعتبر الرابط "معطلاً" فقط إذا كان غير موجود (404) أو محذوف (410) أو طلب خاطئ (400)
        // إذا كان 403 (مرفوض) فهذا يعني أن الملف موجود ولكن السيرفر يمنع فحصه، لذا نحتفظ به
        if (response.status === 404 || response.status === 410 || response.status === 400) {
            return ""; 
        }
        
        return url; 
    } catch (error) {
        // إذا كان هناك فشل كامل في الاتصال (السيرفر لا يرد أبداً أو انتهى الوقت)
        return "";
    }
}

// إعداد مسار الـ API
app.get('/api/extract', async (req, res) => {
    const videoUrl = req.query.url; 
    
    if (!videoUrl) {
        return res.status(400).json({ error: "الرجاء توفير رابط الفيديو" });
    }

    const apiUrl = "https://api.vidssave.com/api/contentsite_api/media/parse";
    const formData = new URLSearchParams();
    
    formData.append("link", videoUrl); 
    formData.append("auth", "20250901majwlqo"); 
    formData.append("domain", "api-ak.vidssave.com");
    formData.append("origin", "source");

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://ar.vidssave.com",
                "Referer": "https://ar.vidssave.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            },
            body: formData
        });
        
        const rawData = await response.json();
        
        // 1. استخراج الروابط
        let filteredData = extractValidDownloads(rawData);
        
        // 2. إبقاء أفضل ملف MP3 فقط
        filteredData = keepBestMp3Only(filteredData);
        
        // 3. فحص الروابط بشكل متوازي
        const finalDownloads = await Promise.all(filteredData.map(async (item) => {
            const aliveUrl = await checkUrlIsAlive(item.download_url);
            return {
                ...item,
                download_url: aliveUrl 
            };
        }));
        
        res.json({
            success: true,
            total_links: finalDownloads.length,
            downloads: finalDownloads
        }); 

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بالخادم الخارجي" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
