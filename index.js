const express = require('express');
const app = express();

// إعداد مسار الـ API
app.get('/api/extract', async (req, res) => {
    // جلب الرابط من المعاملات المرسلة في الرابط (Query Parameters)
    const videoUrl = req.query.url; 
    
    if (!videoUrl) {
        return res.status(400).json({ error: "الرجاء توفير رابط الفيديو" });
    }

    const apiUrl = "https://api.vidssave.com/api/contentsite_api/media/parse";
    const formData = new URLSearchParams();
    
    formData.append("link", videoUrl); 
    // ملاحظة هامة: هذا هو رمز auth. يجب تحديثه إذا توقف التطبيق عن العمل
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
        
        const data = await response.json();
        
        // إرجاع النتيجة للتطبيق بصيغة JSON
        res.json(data); 

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بالخادم الخارجي" });
    }
});

// تحديد منفذ الخادم (Render سيقوم بتحديد المنفذ الخاص به تلقائياً عبر process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
