const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// دالة فك الرابط الوهمي وتحليل الرد المتقدم
async function resolveRedirectUrl(fakeUrl, customUserId, customDeviceId) {
    try {
        const postData = {
            "user_id": customUserId || "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": customDeviceId || "e603540e-ed93-47a3-bec6-a15f7f056604",
            "device_api": "28",
            "version_name": "187",
            "language": "ar",
            "timezone": "Europe/Istanbul",
            "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425",
            "store": "direct",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv",
            "url": fakeUrl,
            "link": fakeUrl
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));

        const response = await axios.post(
            "http://redirect.1spbgmu.com/redirect/getLiveByDoubleRedirect",
            encryptedBody,
            {
                headers: {
                    "Content-Type": "text/plain",
                    "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                    "Host": "redirect.1spbgmu.com",
                    "Connection": "Keep-Alive",
                    "Accept-Encoding": "gzip"
                },
                timeout: 15000,
                responseType: "arraybuffer" 
            }
        );

        const decryptedText = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const jsonResponse = JSON.parse(decryptedText);

        let finalResult = {
            raw_response: jsonResponse,
            stream_url: null,
            headers: null,
            agent: jsonResponse.agent || "ExoPlayer"
        };

        // استخراج الهيدرز والبيانات من حقل url الداخلي إذا وجد
        if (jsonResponse.url) {
            try {
                const innerJson = JSON.parse(jsonResponse.url);
                if (innerJson.headers) {
                    finalResult.headers = innerJson.headers;
                }
                if (innerJson.url) {
                    finalResult.stream_url = innerJson.url;
                }
            } catch (e) {
                finalResult.stream_url = jsonResponse.url;
            }
        }

        // محاولة استخراج رابط الـ m3u8 من الـ raw_data (عبر البحث عن كود atob داخل النص)
        if (jsonResponse.raw_data) {
            const atobMatch = jsonResponse.raw_data.match(/window\.atb?\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/) || 
                              jsonResponse.raw_data.match(/window\.atob\('([^']+)'\)/);
            if (atobMatch && atobMatch[1]) {
                try {
                    const decodedM3u8 = Buffer.from(atobMatch[1], 'base64').toString('utf-8');
                    if (decodedM3u8.startsWith("http")) {
                        finalResult.stream_url = decodedM3u8;
                    }
                } catch (err) {}
            }
        }

        return finalResult;

    } catch (error) {
        console.error("Error resolving redirect:", error.message);
        return { error: true, message: error.message };
    }
}

// مسار جلب القنوات حسب القسم
app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport";
        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
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
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
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
        let rawChannels = Array.isArray(jsonResponse) ? jsonResponse : (jsonResponse.channels || jsonResponse.live || []);

        const formattedChannels = rawChannels.map(ch => ({
            type: ch.type || "tv",
            id_live: ch.id_live || "",
            name: ch.name || "",
            url: ch.url || "",
            agent: ch.agent || "",
            backup: ch.backup || "",
            img_url: ch.img_url || "",
            id_topic: ch.id_topic || topic
        }));

        res.json(formattedChannels);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// مسار جلب روابط البث للقناة
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        if (!id_live) return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });

        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
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
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
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
        const rawJson = JSON.parse(decryptedResponse);
        const liveData = rawJson.live || {};

        let parsedStreams = [];
        const mainUrl = liveData.url || "";
        if (mainUrl.startsWith("http") && !mainUrl.includes(".LS.V2live")) {
            parsedStreams.push({ server_name: "السيرفر الأساسي", url: mainUrl, agent: liveData.agent || "ExoPlayer", drm: null });
        }

        const backupStr = liveData.backup || "";
        if (backupStr) {
            backupStr.split("-;-").forEach((part) => {
                part = part.trim();
                if (!part) return;
                const subParts = part.split("--");
                const linkData = subParts[0] ? subParts[0].trim() : "";
                let agentData = subParts[1] ? subParts[1].trim() : "ExoPlayer";
                if (!linkData) return;

                let streamObj = { server_name: `سيرفر ${parsedStreams.length + 1}`, url: "", agent: agentData, drm: null };
                if (linkData.startsWith("{") && linkData.endsWith("}")) {
                    try {
                        const jsonObj = JSON.parse(linkData);
                        streamObj.url = jsonObj.url || "";
                        if (jsonObj.agent) streamObj.agent = jsonObj.agent;
                        if (jsonObj.headers?.["User-Agent"]) streamObj.agent = jsonObj.headers["User-Agent"];
                        if (jsonObj.drm) streamObj.drm = jsonObj.drm;
                    } catch (e) {}
                } else {
                    streamObj.url = linkData;
                }
                if (streamObj.url.startsWith("http")) parsedStreams.push(streamObj);
            });
        }

        res.json({ id_live: liveData.id_live || id_live, name: liveData.name || "", img_url: liveData.img_url || "", streams: parsedStreams });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// مسار الفك النهائي
app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url; 
        const customUserId = req.query.user_id || req.body.user_id;
        const customDeviceId = req.query.device_id || req.body.device_id;
        
        if (!targetUrl) {
            return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url) المراد استخراجه" });
        }

        const result = await resolveRedirectUrl(targetUrl, customUserId, customDeviceId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

const allTopics = [
    {"id_topic":"arabic_sport","name_topic":"رياضة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_basketball_red.png","code":""},
    {"id_topic":"live_matches","name_topic":"مباريات مباشرة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_fire.jpg","code":""}
];

app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
