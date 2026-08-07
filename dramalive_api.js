const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ==========================================
// 1. إعدادات التشفير (AES) - ضع المفاتيح الخاصة بك هنا
// ==========================================
const AES_KEY = Buffer.from('ضع_مفتاح_التشفير_هنا', 'utf8'); // استبدل هذا بالمفتاح الخاص بك
const AES_IV = Buffer.from('ضع_متجه_التهيئة_هنا', 'utf8');    // استبدل هذا بـ IV الخاص بك

function encryptAES(text) {
    // هذا مجرد نموذج قياسي، استخدم دالة التشفير الخاصة بك إذا كانت مختلفة
    const cipher = crypto.createCipheriv('aes-128-cbc', AES_KEY, AES_IV); // قد يكون aes-256-cbc
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

function decryptAES(encryptedText) {
    // هذا مجرد نموذج قياسي، استخدم دالة فك التشفير الخاصة بك إذا كانت مختلفة
    const decipher = crypto.createDecipheriv('aes-128-cbc', AES_KEY, AES_IV);
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ==========================================
// 2. دوال مساعدة لمعالجة الروابط
// ==========================================
function convertFakeUrlToRealUrl(fakeUrl, channelId) {
    // تحويل الرابط العادي إلى كائن JSON الذي يتوقعه السيرفر
    return JSON.stringify({
        url: fakeUrl,
        data: "",
        acceptSSL: "1",
        iframe: "",
        headers: {}
    });
}

async function fetchRedirectData(endpoint, channelId, targetUrl) {
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
        "id": channelId,
        "url": targetUrl,
        "agent": endpoint === "getLiveByRedirect" ? "redirect" : "double_redirect",
        "raw_data": ""
    };

    const encryptedBody = encryptAES(JSON.stringify(postData));

    const response = await axios.post(
        `http://redirect.1spbgmu.com/redirect/${endpoint}`,
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
    return JSON.parse(decryptedText);
}

// ==========================================
// 3. دالة فك التشفير واستخراج الرابط النهائي ذكياً
// ==========================================
async function autoResolve(channelId, fakeUrl) {
    let result = { stream_url: null, headers: {}, agent: "ExoPlayer" };
    
    try {
        let realUrl = fakeUrl.startsWith("{") ? fakeUrl : convertFakeUrlToRealUrl(fakeUrl, channelId);

        const extractStream = (jsonResponse) => {
            let extData = { url: null, headers: {}, agent: "ExoPlayer" };
            
            if (jsonResponse.data && jsonResponse.data.url) {
                try {
                    const innerData = JSON.parse(jsonResponse.data.url);
                    extData.url = innerData.url || null;
                    if (innerData.headers) extData.headers = innerData.headers;
                    if (innerData.agent) extData.agent = innerData.agent;
                } catch (e) {
                    extData.url = jsonResponse.data.url;
                }
            }
            
            if (!extData.url && jsonResponse.raw_data) {
                const atobMatches = jsonResponse.raw_data.match(/window\.atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/g);
                if (atobMatches) {
                    for (let match of atobMatches) {
                        const base64Match = match.match(/['"]([A-Za-z0-9+/=]+)['"]/);
                        if (base64Match && base64Match[1]) {
                            try {
                                const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                                if (decoded.includes(".m3u8") || decoded.includes(".mpd") || decoded.startsWith("http")) {
                                    extData.url = decoded;
                                    break;
                                }
                            } catch (err) {}
                        }
                    }
                }
                if (!extData.url) {
                    const mediaMatch = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mpd)[^\s"'<>]*)/);
                    if (mediaMatch) extData.url = mediaMatch[1];
                }
            }
            return extData;
        };

        // المحاولة الأولى
        let resJson = await fetchRedirectData("getLiveByRedirect", channelId, realUrl);
        let firstExtracted = extractStream(resJson);

        if (firstExtracted.url && (firstExtracted.url.includes(".m3u8") || firstExtracted.url.includes(".mpd"))) {
            result.stream_url = firstExtracted.url;
            result.headers = firstExtracted.headers;
            result.agent = (firstExtracted.agent === "redirect" || firstExtracted.agent === "double_redirect") ? "ExoPlayer" : firstExtracted.agent;
            return result;
        }

        // المحاولة الثانية (Double Redirect) إذا فشلت الأولى
        let secondTargetUrl = firstExtracted.url ? firstExtracted.url : realUrl;
        if (!secondTargetUrl.startsWith("{")) {
            secondTargetUrl = `{"url":"${secondTargetUrl}","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
        }

        let doubleResJson = await fetchRedirectData("getLiveByDoubleRedirect", channelId, secondTargetUrl);
        let secondExtracted = extractStream(doubleResJson);

        if (secondExtracted.url) {
            result.stream_url = secondExtracted.url;
            result.headers = Object.keys(secondExtracted.headers).length ? secondExtracted.headers : firstExtracted.headers;
            result.agent = (secondExtracted.agent === "redirect" || secondExtracted.agent === "double_redirect") ? "ExoPlayer" : secondExtracted.agent;
        }

    } catch (error) {
        console.error(`Error resolving channel ${channelId}:`, error.message);
    }
    
    return result;
}

// ==========================================
// 4. المسار الرئيسي لجلب البث (API Endpoint)
// ==========================================
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

        let rawStreams = [];
        
        // استخراج السيرفر الأساسي
        const mainUrl = liveData.url || "";
        if (mainUrl && mainUrl !== "empty") {
            rawStreams.push({
                server_name: "السيرفر الأساسي",
                url: mainUrl,
                agent: liveData.agent || "ExoPlayer",
                drm: null,
                headers: {}
            });
        }

        // استخراج السيرفرات الاحتياطية
        const backupStr = liveData.backup || "";
        if (backupStr) {
            const backupParts = backupStr.split("-;-");
            for (let i = 0; i < backupParts.length; i++) {
                const part = backupParts[i].trim();
                if (!part) continue;
                
                const subParts = part.split("--");
                let linkData = subParts[0] ? subParts[0].trim() : "";
                const agentData = subParts[1] ? subParts[1].trim() : "ExoPlayer";
                
                if (!linkData) continue;

                let streamObj = {
                    server_name: `سيرفر ${rawStreams.length + 1}`,
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
                    } catch (e) {
                        streamObj.url = linkData;
                    }
                } else {
                    streamObj.url = linkData;
                }

                if (streamObj.url) rawStreams.push(streamObj);
            }
        }

        // معالجة الروابط بشكل متوازي
        const finalResolvedStreams = await Promise.all(rawStreams.map(async (stream) => {
            if (stream.url && (stream.url.includes(".m3u8") || stream.url.includes(".mpd") || stream.url.includes(".ts"))) {
                if (stream.agent === "redirect" || stream.agent === "double_redirect") stream.agent = "ExoPlayer";
                return stream;
            }

            if (stream.agent === "redirect" || stream.agent === "double_redirect" || stream.url.includes(".LS.V2")) {
                const resolved = await autoResolve(id_live, stream.url);
                
                if (resolved && resolved.stream_url) {
                    stream.url = resolved.stream_url;
                    stream.agent = resolved.agent || "ExoPlayer";
                    if (Object.keys(resolved.headers).length > 0) {
                        stream.headers = resolved.headers;
                    }
                }
            }
            
            return stream;
        }));

        const validStreams = finalResolvedStreams.filter(s => s.url && s.url.startsWith("http"));

        res.json({
            id_live: liveData.id_live || id_live,
            name: liveData.name || "",
            img_url: liveData.img_url || "",
            streams: validStreams.length > 0 ? validStreams : finalResolvedStreams
        });

    } catch (error) {
        console.error("Error fetching streams:", error);
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 5. تشغيل السيرفر
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
