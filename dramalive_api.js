const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// الإعدادات
const KEY = "0123456789abcdef";
const IV = "fedcba9876543210";
const ALGORITHM = "aes-128-cbc";

// دالة التشفير (للطلب)
function encrypt(text) {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY, 'latin1'), Buffer.from(IV, 'latin1'));
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

// دالة فك التشفير (للرد)
function decrypt(encryptedText) {
    console.log("--- الرد الخام القادم من السيرفر ---");
    console.log(encryptedText);
    console.log("----------------------------------");

    // فحص ما إذا كان الرد يحتوي على IV مدمج
    let data = encryptedText;
    let ivToUse = IV;

    if (encryptedText.includes(':')) {
        const parts = encryptedText.split(':');
        data = parts[0];
        if (parts[1]) {
            // محاولة استخراج IV ديناميكي إذا وجد
            ivToUse = Buffer.from(parts[1], 'base64').toString('latin1');
        }
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY, 'latin1'), Buffer.from(ivToUse, 'latin1'));
    
    try {
        let decrypted = decipher.update(data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (err) {
        console.error("فشل فك التشفير، الرد قد لا يكون مشفراً أو المفتاح خاطئ:", err.message);
        return { error: "فك التشفير فشل", raw: encryptedText };
    }
}

app.all('/api/get-topics', async (req, res) => {
    const targetUrl = "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic";

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
        const encryptedPayload = encrypt(JSON.stringify(payload));

        const response = await axios.post(targetUrl, encryptedPayload, {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                "Host": "live.1spbgmu.com",
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            }
        });

        // هنا نقوم بفك التشفير
        const result = decrypt(response.data);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: "فشل الاتصال بالسيرفر", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
