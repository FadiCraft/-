const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// --- إعدادات التشفير ---
const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

function encryptAES(data) {
    const encrypted = CryptoJS.AES.encrypt(data, KEY, {
        iv: IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString() + ":" + CryptoJS.enc.Base64.stringify(IV);
}

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

// --- دالة توحيد هيكل القنوات ---
function mapChannel(item) {
    return {
        "type": item.type || "tv",
        "id_live": item.id_live || "",
        "name": item.name || "Unknown",
        "url": item.url || "1",
        "agent": item.agent || "all_streams_redirect",
        "backup": item.backup || "",
        "img_url": item.img_url || "",
        "id_topic": item.id_topic || ""
    };
}

// --- دالة توحيد هيكل البث (تحويل السلاسل المعقدة إلى مصفوفة نظيفة) ---
function mapStream(liveData) {
    const sources = [];

    // 1. إضافة الرابط الأساسي إذا كان موجوداً
    if (liveData.url && liveData.url !== "1") {
        sources.push({ url: liveData.url, agent: liveData.agent || "Mozilla", type: "primary" });
    }

    // 2. معالجة الـ backup المعقد (الذي يأتي كسلسلة نصية مفصولة بـ -;-)
    if (liveData.backup) {
        const parts = liveData.backup.split("-;-");
        parts.forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            // إذا كان الرابط هو JSON
            if (trimmed.startsWith("{")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    sources.push({ url: parsed.url, agent: parsed.agent || "Mozilla", type: "backup" });
                } catch (e) { sources.push({ url: trimmed, agent: "Mozilla", type: "backup" }); }
            } 
            // إذا كان رابط عادي
            else if (trimmed.includes("http")) {
                sources.push({ url: trimmed, agent: "Mozilla", type: "backup" });
            }
        });
    }

    return {
        id_live: liveData.id_live,
        name: liveData.name,
        sources: sources // مصفوفة نظيفة لكل الروابط المتاحة
    };
}

// --- المسارات ---

// 1. مسار جلب القنوات
app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport";
        // ... (كود الـ postData كما هو)
        const postData = { /* ضع نفس الـ JSON الخاص بك هنا */ "topic": topic, "type": "tv", "user_id": "_19449_1785337989457_notloggedin.com_dramalive3", "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe" }; 

        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic", encryptedBody, { headers: { "Content-Type": "text/plain" } });
        
        const data = JSON.parse(decryptAES(response.data));
        
        // تحويل البيانات للهيكل الثابت
        const formattedChannels = (data.live || []).map(mapChannel);
        res.json(formattedChannels);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// 2. مسار جلب البث
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const postData = { /* ضع نفس الـ JSON الخاص بك هنا */ "id_live": id_live, "type": "tv", "user_id": "_19449_1785337989457_notloggedin.com_dramalive3" };

        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedBody, { headers: { "Content-Type": "text/plain" }, responseType: "arraybuffer" });

        const data = JSON.parse(decryptAES(Buffer.from(response.data).toString("utf-8")));
        
        // تحويل البيانات لهيكل ذكي
        const formattedStream = mapStream(data.live);
        res.json(formattedStream);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.listen(PORT, () => console.log("Server running on port " + PORT));
