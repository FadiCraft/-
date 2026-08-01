const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// مفاتيح التشفير الثابتة
const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

// دالة التشفير
function encryptAES(data) {
    const encrypted = CryptoJS.AES.encrypt(data, KEY, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString() + ":" + CryptoJS.enc.Base64.stringify(IV);
}

// دالة فك التشفير
function decryptAES(encryptedText) {
    encryptedText = encryptedText.trim();
    const lastColon = encryptedText.lastIndexOf(":");
    const encryptedData = encryptedText.substring(0, lastColon);
    const ivBase64 = encryptedText.substring(lastColon + 1);

    const decrypted = CryptoJS.AES.decrypt(encryptedData, KEY, {
        iv: CryptoJS.enc.Base64.parse(ivBase64),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
}

// 1. مسار جلب القنوات حسب القسم (Topic)
app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport"; // افتراضي إذا لم يحدد المستخدم
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
            "topic": topic
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));

        const response = await axios.post(
            "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic",
            encryptedBody,
            {
                headers: {
                    "Content-Type": "text/plain",
                    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                    "Host": "live.1spbgmu.com",
                    "Connection": "Keep-Alive"
                },
                timeout: 30000
            }
        );

        const jsonResponse = JSON.parse(decryptAES(response.data));
        res.json(jsonResponse);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// 2. مسار جلب روابط البث للقناة (Stream)
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        if (!id_live) return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });

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
            "id_live": id_live,
            "id": id_live,
            "live_id": id_live,
            "channel_id": id_live
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));

        const response = await axios.post(
            "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById",
            encryptedBody,
            {
                headers: {
                    "Content-Type": "text/plain",
                    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                    "Host": "live.1spbgmu.com",
                    "Connection": "Keep-Alive"
                },
                timeout: 30000,
                responseType: "arraybuffer"
            }
        );

        const decryptedResponse = decryptAES(Buffer.from(response.data).toString("utf-8"));
        res.json(JSON.parse(decryptedResponse));

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});



// قائمة الأقسام الكاملة (ضعها في بداية الملف)
const allTopics = [
    {"id_topic":"hot_now","name_topic":"الأكثر مشاهدة"},
    {"id_topic":"live_matches","name_topic":"مباريات مباشرة"},
    {"id_topic":"alwan","name_topic":"الوان"},
    {"id_topic":"shahid","name_topic":"شاهد"},
    {"id_topic":"arabic_sport","name_topic":"رياضة"},
    {"id_topic":"ar_1","name_topic":"ترفيه عربي"},
    {"id_topic":"ar_2","name_topic":"أخبار"},
    {"id_topic":"ar_3","name_topic":"أطفال"},
    {"id_topic":"ar_5","name_topic":"وثائقي"},
    {"id_topic":"ar_6","name_topic":"ديني"},
    {"id_topic":"ar_7","name_topic":"أفلام"},
    {"id_topic":"ar_8","name_topic":"موسيقى"},
    {"id_topic":"art","name_topic":"ART"},
    {"id_topic":"osn","name_topic":"OSN"},
    {"id_topic":"netflix","name_topic":"NETFLIX"},
    {"id_topic":"mbc","name_topic":"MBC"},
    {"id_topic":"rotana","name_topic":"روتانا"},
    {"id_topic":"cook","name_topic":"الطبخ"},
    {"id_topic":"weyyak","name_topic":"وياك"},
    {"id_topic":"bein_entir","name_topic":"بي ان ترفيه"},
    {"id_topic":"bein_sport","name_topic":"بي ان سبورت"},
    {"id_topic":"relax","name_topic":"ريلاكس"},
    {"id_topic":"science","name_topic":"علوم"},
    {"id_topic":"anime","name_topic":"انيمي"},
    {"id_topic":"roya","name_topic":"رؤيا"},
    {"id_topic":"twitch","name_topic":"Live Twitch"},
    {"id_topic":"963","name_topic":"سوريا"},
    {"id_topic":"961","name_topic":"لبنان"},
    {"id_topic":"966","name_topic":"السعودية"},
    {"id_topic":"20","name_topic":"مصر"}
    // يمكنك إضافة باقي الدول هنا بنفس النمط
];

// مسار جديد لجلب القائمة الكاملة
app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
