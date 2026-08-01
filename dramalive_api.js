const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json()); // للسماح باستقبال البيانات بصيغة JSON

const KEY = "0123456789abcdef";
const IV = "fedcba9876543210";
const ALGORITHM = "aes-128-cbc";

function encrypt(text) {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), Buffer.from(IV));
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const ivBase64 = Buffer.from(IV).toString('base64');
    return `${encrypted}:${ivBase64}`;
}

// الرابط الخاص بك الذي ستستدعيه من تطبيقاتك
app.post('/api/get-stream', async (req, res) => {
    // الرابط المستهدف (قم بتعديله للرابط الحقيقي الخاص بك)
    const targetUrl = "http://api.example.com/target-endpoint";

    // يمكنك إرسال البيانات ديناميكياً من تطبيقك، أو استخدام بيانات ثابتة
    const payload = req.body.payload || {
        "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe",
        "device_api": "28",
        "language": "ar",
        "device_type": "phone"
        // ... ضع باقي البيانات هنا
    };

    try {
        const encryptedPayload = encrypt(JSON.stringify(payload));
        
        const response = await axios.post(targetUrl, encryptedPayload, {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                "Host": "api.example.com", // عدل الهوست أيضاً
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            }
        });

        // إرسال الرد لتطبيقك كـ JSON
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بالسيرفر الهدف" });
    }
});

// Render يقوم بتحديد البورت تلقائياً عبر متغيرات البيئة
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
