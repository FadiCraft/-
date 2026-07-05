const express = require('express');
const app = express();

app.get('/api/extract', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "الرجاء توفير رابط الفيديو" });

    const apiUrl = "https://api.vidssave.com/api/contentsite_api/media/parse";
    const formData = new URLSearchParams();
    
    // البيانات الأساسية للطلب
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
        
        // التحقق من نجاح الاستجابة
        if (rawData.status !== 1) {
            return res.status(500).json({ error: "فشل استخراج البيانات من المصدر" });
        }

        const d = rawData.data;

        // ترتيب وتنسيق البيانات بشكل نظيف للتطبيق
        const refinedData = {
            title: d.title || "بدون عنوان",
            thumbnail: d.thumbnail || "",
            description: d.description || "لا يوجد وصف",
            views: d.view_count || "0",
            likes: d.like_count || "0",
            channel: {
                name: d.user_item?.nickname || "غير معروف",
                avatar: d.user_item?.avatar || "",
                subscribers: "غير متاح عبر هذا الـ API" // الـ API لا يرسل هذا الرقم
            },
            // استخراج أفضل رابط صوت
            audio: d.resources.filter(r => r.type === 'audio').map(a => ({
                format: a.format,
                download_url: a.resource_content
            }))[0] || null,
            // استخراج قائمة الفيديوهات
            videos: d.resources.filter(r => r.type === 'video').map(v => ({
                quality: v.quality,
                format: v.format,
                download_url: v.resource_content // الاسم الذي طلبته
            }))
        };

        // إرسال النتيجة المرتبة
        res.json(refinedData);

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: "حدث خطأ تقني في الخادم" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});
