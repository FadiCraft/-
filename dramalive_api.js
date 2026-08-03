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

// الدالة الموحدة لاستخراج الرابط المباشر
async function extractStreamUrl(channelId, urlValue, agentType) {
    try {
        let finalUrl;
        let rawData = "";
        
        // تحضير البيانات بالضبط زي ما التطبيق بيعمل
        if (agentType === "redirect") {
            if (urlValue.includes("daddy_")) {
                const daddyId = urlValue.match(/daddy_(\d+)/)?.[1] || "";
                finalUrl = JSON.stringify({
                    "url": `https://hamis.romponalis.st/premiumtv/daddy4.php?id=${daddyId}`,
                    "data": "",
                    "acceptSSL": "1",
                    "iframe": `https://daddylive.mov/embed/embed.php?id=${daddyId}&player=1&source=tv.json`,
                    "headers": {
                        "Referer": "https://dlhd.pk/"
                    }
                });
            } else {
                finalUrl = JSON.stringify({
                    "url": urlValue,
                    "data": "",
                    "acceptSSL": "1",
                    "iframe": "",
                    "headers": {}
                });
            }
        } else if (agentType === "double_redirect") {
            // للـ double_redirect نستخدم الرابط كما هو مع raw_data فاضي
            finalUrl = urlValue;
            rawData = "";
        }

        // بالضبط زي البيانات اللي التطبيق ببعتها
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
            "appCount": "{\"adsFailed\":80,\"adsLoaded\":64,\"adsShowed\":22,\"runCount\":10}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "id": channelId,
            "url": finalUrl,
            "agent": agentType === "redirect" ? "double_redirect" : agentType,
            "raw_data": rawData
        };

        console.log("Sending postData:", JSON.stringify(postData).substring(0, 500));
        
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
        console.log("Full decrypted response:", decryptedText);
        
        const jsonResponse = JSON.parse(decryptedText);

        let result = {
            stream_url: null,
            headers: {},
            agent: "ExoPlayer",
            full_response: jsonResponse
        };

        // استخراج الرابط من data.url
        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                // الرابط المباشر موجود في innerData.url
                if (innerData.url && innerData.url.includes("m3u8")) {
                    result.stream_url = innerData.url;
                }
                if (innerData.headers) {
                    result.headers = innerData.headers;
                }
                if (innerData.agent) {
                    result.agent = innerData.agent;
                }
            } catch (e) {
                // لو مش JSON، يمكن يكون رابط مباشر
                if (jsonResponse.data.url.includes("m3u8")) {
                    result.stream_url = jsonResponse.data.url;
                }
            }
        }

        // لو لسه ما لقيناش الرابط، نبحث في raw_data
        if (!result.stream_url && jsonResponse.raw_data) {
            // البحث عن window.atob
            const atobMatches = jsonResponse.raw_data.match(/window\.atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/g);
            if (atobMatches) {
                for (let match of atobMatches) {
                    const base64Match = match.match(/['"]([A-Za-z0-9+/=]+)['"]/);
                    if (base64Match && base64Match[1]) {
                        try {
                            const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                            if (decoded.includes(".m3u8") || decoded.startsWith("http")) {
                                result.stream_url = decoded;
                                break;
                            }
                        } catch (err) {}
                    }
                }
            }
            
            // البحث عن رابط m3u8 مباشر
            if (!result.stream_url) {
                const m3u8Match = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
                if (m3u8Match) {
                    result.stream_url = m3u8Match[1];
                }
            }
        }

        return result;

    } catch (error) {
        console.error("Error extracting stream:", error.message);
        return { error: true, message: error.message };
    }
}

// 1. مسار جلب القنوات
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

// 2. مسار جلب روابط البث مع استخراج الروابط المباشرة
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const extract = req.query.extract === "true";
        
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
        
        // معالجة السيرفر الأساسي
        const mainUrl = liveData.url || "";
        const mainAgent = liveData.agent || "";
        
        if (mainUrl && mainUrl !== "empty") {
            let streamObj = {
                server_name: "السيرفر الأساسي",
                url: mainUrl,
                agent: mainAgent,
                drm: null
            };

            if (extract && (mainAgent === "redirect" || mainAgent === "double_redirect")) {
                const resolved = await extractStreamUrl(id_live, mainUrl, mainAgent);
                if (resolved.stream_url) {
                    streamObj.direct_url = resolved.stream_url;
                    streamObj.stream_headers = resolved.headers;
                    streamObj.stream_agent = resolved.agent;
                }
            }

            parsedStreams.push(streamObj);
        }

        // معالجة السيرفرات الاحتياطية
        const backupStr = liveData.backup || "";
        if (backupStr) {
            const backupParts = backupStr.split("-;-");
            
            for (let i = 0; i < backupParts.length; i++) {
                const part = backupParts[i].trim();
                if (!part) continue;
                
                const subParts = part.split("--");
                const linkData = subParts[0] ? subParts[0].trim() : "";
                const agentData = subParts[1] ? subParts[1].trim() : "ExoPlayer";
                
                if (!linkData) continue;

                let streamObj = {
                    server_name: `سيرفر ${parsedStreams.length + 1}`,
                    url: "",
                    agent: agentData,
                    drm: null,
                    headers: {}
                };

                if (linkData.startsWith("{") && linkData.endsWith("}")) {
                    try {
                        const jsonObj = JSON.parse(linkData);
                        streamObj.url = jsonObj.url || "";
                        if (jsonObj.agent) streamObj.agent = jsonObj.agent;
                        if (jsonObj.headers) streamObj.headers = jsonObj.headers;
                        if (jsonObj.drm) streamObj.drm = jsonObj.drm;
                        
                        if (extract && agentData === "double_redirect") {
                            const resolved = await extractStreamUrl(id_live, linkData, agentData);
                            if (resolved.stream_url) {
                                streamObj.direct_url = resolved.stream_url;
                                streamObj.stream_headers = resolved.headers;
                                streamObj.stream_agent = resolved.agent;
                            }
                        }
                    } catch (e) {
                        streamObj.url = linkData;
                    }
                } else {
                    streamObj.url = linkData;
                    
                    if (extract && agentData === "redirect") {
                        const resolved = await extractStreamUrl(id_live, linkData, agentData);
                        if (resolved.stream_url) {
                            streamObj.direct_url = resolved.stream_url;
                            streamObj.stream_headers = resolved.headers;
                            streamObj.stream_agent = resolved.agent;
                        }
                    }
                }

                if (streamObj.url) {
                    parsedStreams.push(streamObj);
                }
            }
        }

        res.json({
            id_live: liveData.id_live || id_live,
            name: liveData.name || "",
            img_url: liveData.img_url || "",
            streams: parsedStreams
        });

    } catch (error) {
        console.error("Stream error:", error);
        res.status(500).json({ error: true, message: error.message });
    }
});

// 3. مسار استخراج رابط مباشر من أي سيرفر
app.all("/extract", async (req, res) => {
    try {
        const channelId = req.query.id_live || req.body.id_live;
        const urlValue = req.query.url || req.body.url;
        const agentType = req.query.agent || req.body.agent || "redirect";
        
        if (!channelId || !urlValue) {
            return res.status(400).json({
                error: true,
                message: "يرجى إرسال id_live و url و agent"
            });
        }

        const result = await extractStreamUrl(channelId, urlValue, agentType);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// قائمة الأقسام
const allTopics = [
    {"id_topic":"hot_now","name_topic":"الأكثر مشاهدة","img_url_topic":"http://logo.twoapistack.work/img/topics/hot_now.png","code":""},
    {"id_topic":"live_matches","name_topic":"مباريات مباشرة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_fire.jpg","code":""},
    {"id_topic":"alwan","name_topic":"الوان","img_url_topic":"http://logo.twoapistack.work/img/topics/alwan.jpg","code":""},
    {"id_topic":"shahid","name_topic":"شاهد","img_url_topic":"http://logo.twoapistack.work/img/topics/shahid.jpg","code":""},
    {"id_topic":"arabic_sport","name_topic":"رياضة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_basketball_red.png","code":""},
    {"id_topic":"bein_sport","name_topic":"بي ان سبورت","img_url_topic":"http://logo.twoapistack.work/img/topics/bein_sport.png","code":""}
];

app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
