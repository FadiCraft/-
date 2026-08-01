const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// المفاتيح الثابتة كما في إعدادات CyberChef
const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

// دالة فك التشفير المعدلة (تتعامل مع النص كـ Base64 مباشر)
function decryptAES(encryptedText) {
    // إزالة أي مسافات زائدة (مهم جداً!)
    const cleanText = encryptedText.trim();
    
    const decrypted = CryptoJS.AES.decrypt(cleanText, KEY, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    // تحويل الناتج إلى نص مقروء
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!result) {
        throw new Error("فشل فك التشفير: الناتج فارغ، تأكد من أن الـ Key والـ IV صحيحان");
    }
    return result;
}

app.get("/", async (req, res) => {
    try {
        // ... (نفس بيانات الـ postData السابقة) ...
        const postData = {
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

        // التشفير (بما أن الـ IV ثابت، نستخدمه كما هو في CyberChef)
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(postData), KEY, {
            iv: IV,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        const encryptedBody = encrypted.toString();

        const response = await axios.post(
            "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic",
            encryptedBody,
            {
                headers: {
                    "Content-Type": "text/plain",
                    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                    "Host": "live.1spbgmu.com",
                    "Connection": "Keep-Alive",
                    "Accept-Encoding": "gzip"
                }
            }
        );

        // فك التشفير
        const decryptedString = decryptAES(response.data);
        res.json(JSON.parse(decryptedString));

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log("Server ready on port " + PORT);
});
