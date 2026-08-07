const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// للسماح بقراءة البيانات القادمة
app.use(express.json());
app.use(express.text());

// مسار /ref
app.post('/ref', async (req, res) => {
    try {
        // افتراض أنك تستلم البيانات المشفرة أو تقوم بتوليدها هنا
        const encryptedBody = req.body; 
        const targetUrl = "https://redirect.1spbgmu.com/ref";

        // طباعة الرابط قبل بدء الطلب
        console.log("⏳ Sending POST request to:", targetUrl);

        const response = await axios({
            method: 'post',
            url: targetUrl,
            data: encryptedBody,
            timeout: 30000, // تم زيادة الوقت إلى 30 ثانية
            headers: {
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; TV Box Build/QQ3A.200805.001)",
                "Content-Type": "text/plain; charset=utf-8", // تم إعادتها إلى text/plain
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            }
        });

        console.log("✅ Request successful");
        res.send(response.data);

    } catch (error) {
        // طباعة تفاصيل الخطأ في الكونسول
        console.error("❌ Error during request to /ref:");
        console.error(error.message);

        // إرجاع الخطأ للمستخدم
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).send("Timeout or network error");
        }
    }
});

// إذا كان لديك مسار /live يمكنك إضافته بنفس الطريقة هنا
app.get('/live', async (req, res) => {
    try {
        const targetUrl = "https://live.1spbgmu.com/live"; // مثال
        console.log("⏳ Sending GET request to:", targetUrl);

        const response = await axios({
            method: 'get',
            url: targetUrl,
            timeout: 30000,
            headers: {
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10)",
            }
        });

        console.log("✅ Request successful");
        res.send(response.data);

    } catch (error) {
        console.error("❌ Error during request to /live:", error.message);
        res.status(500).send("Error");
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
