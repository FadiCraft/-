const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// الثوابت التي زودتني بها
const KEY = "0123456789abcdef";
const IV = "fedcba9876543210";
const ALGORITHM = "aes-128-cbc";

// دالة التشفير (لإرسال الطلب)
function encrypt(text) {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY, 'latin1'), Buffer.from(IV, 'latin1'));
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted; // لاحظ أن السيرفر قد يتوقع تنسيقاً معيناً، هذا التنسيق هو الأساسي
}

// دالة فك التشفير (لقراءة الرد القادم من السيرفر)
function decrypt(encryptedText) {
    // السيرفر غالباً يرسل الرد بصيغة: النص المشفر:Base64(IV)
    const [data, ivPart] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY, 'latin1'), Buffer.from(IV, 'latin1'));
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

app.all('/api/get-topics', async (req, res) => {
    const targetUrl = "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic";

    // الباي لود الذي طلبته
    const payload = {
        "user_id": "_19449_1785337989457_notloggedin.com_dramalive3",
        "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe",
        "device_api": "28",
        "version_name": "187",
        "language": "ar",
        "timezone": "Europe/Istanbul",
        "device_type": "phone",
        "KEY_ACTIVATED_TYPE": "232425",
        "store": "direct",
        "isStoreVersion": false,
        "isPremium": false,
        "isCoupon_active": false,
        "hideAds": false,
        "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
        "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
        "type": "tv",
        "topic": "arabic_sport"
    };

    try {
        // تشفير الطلب
        const encryptedPayload = encrypt(JSON.stringify(payload));

        // إرسال الطلب للسيرفر الأصلي
        const response = await axios.post(targetUrl, encryptedPayload, {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                "Host": "live.1spbgmu.com",
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            }
        });

        // فك تشفير الرد
        const decryptedData = decrypt(response.data);
        res.json(decryptedData);

    } catch (error) {
        console.error("خطأ:", error.message);
        res.status(500).json({ error: "فشل الاتصال", details: error.response?.data || error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
