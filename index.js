const express = require('express');
const app = express();

app.get('/api/extract', async (req, res) => {
    const videoUrl = req.query.url; 
    if (!videoUrl) return res.status(400).json({ error: "الرجاء توفير رابط الفيديو" });

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
        
        // التحقق من أن الاستجابة ناجحة
        if (rawData.status !== 1) {
            return res.status(500).json({ error: "فشل استخراج البيانات" });
        }

        const d = rawData.data; // الوصول للبيانات الأساسية

        // ترتيب وتنسيق البيانات بالشكل المطلوب
        const refinedData = {
            title: d.title || "بدون عنوان",
            thumbnail: d.thumbnail || "",
            description: d.description || "لا يوجد وصف",
            views: d.view_count || "0",
            likes: d.like_count || "0",
            channel: {
                name: d.user_item?.nickname || "غير معروف",
                avatar: d.user_item?.avatar || "",
                // ملاحظة: أغلب APIs التحميل لا توفر عدد المشتركين بدقة، تم وضع "غير متاح"
                subscribers: "غير متاح عبر هذا الـ API" 
            },
            // استخراج أفضل ملف صوت
            audio: d.resources.filter(r => r.type === 'audio')[0] || null,
            // استخراج قائمة الفيديوهات (جودة واحدة لكل نوع)
            videos: d.resources.filter(r => r.type === 'video').map(v => ({
                quality: v.quality,
                format: v.format,
                url: v.resource_content
            }))
        };

        res.json(refinedData); 

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بالخادم" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
