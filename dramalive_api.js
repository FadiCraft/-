const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// السماح بقراءة البيانات المرسلة بصيغة JSON و URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ==========================================
// دالة: تحويل الرابط الوهمي (LS.V2) إلى رابط مزدوج
// ==========================================
function convertFakeUrlToRealUrl(fakeUrl, channelId) {
    const match = fakeUrl.match(/\.LS\.V2(.+?)\/s$/);
    if (!match) return fakeUrl;
    
    const extractedPart = match[1];
    let realUrl = "";
    
    if (extractedPart.includes("LOAD_BALANCER")) {
        const cleanId = extractedPart.replace("LOAD_BALANCER", "");
        realUrl = `{"url":"http://.LS.V2LOAD_BALANCER${cleanId}/s","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
    } else if (extractedPart.includes("custom_handler")) {
        realUrl = `{"url":"${fakeUrl}","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
    } else if (extractedPart.includes("daddy_")) {
        const daddyId = extractedPart.replace("daddy_", "");
        realUrl = `{"url":"https://hamis.romponalis.st/premiumtv/daddy4.php?id=${daddyId}","data":"","acceptSSL":"1","iframe":"https://daddylive.mov/embed/embed.php?id=${daddyId}&player=1&source=tv.json","headers":{"Referer":"https://dlhd.pk/"}}`;
    } else {
        realUrl = `{"url":"${fakeUrl}","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
    }
    
    return realUrl;
}

// ==========================================
// دالة: معالجة سيرفرات redirect (القديمة)
// ==========================================
async function resolveRedirectServer(channelId, fakeUrl) {
    try {
        const realUrl = convertFakeUrlToRealUrl(fakeUrl, channelId);
        
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
            "url": realUrl,
            "agent": "redirect",
            "raw_data": ""
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

        let result = {
            stream_url: null,
            headers: {},
            agent: "ExoPlayer"
        };

        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                result.stream_url = innerData.url || null;
                if (innerData.headers) {
                    result.headers = innerData.headers;
                }
                if (innerData.agent) {
                    result.agent = innerData.agent;
                }
            } catch (e) {
                result.stream_url = jsonResponse.data.url;
            }
        }

        if (!result.stream_url && jsonResponse.raw_data) {
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
        }

        if (!result.stream_url && jsonResponse.raw_data) {
            const m3u8Match = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
            if (m3u8Match) {
                result.stream_url = m3u8Match[1];
            }
        }

        return result;

    } catch (error) {
        console.error("Error in redirect server:", error.message);
        return { error: true, message: error.message };
    }
}

// ==========================================
// دالة: معالجة سيرفرات double_redirect
// ==========================================
async function resolveDoubleRedirect(channelId, serverUrl) {
    try {
        let urlData = serverUrl;
        
        if (!serverUrl.startsWith("{")) {
            urlData = convertFakeUrlToRealUrl(serverUrl, channelId);
        }

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
            "url": urlData,
            "agent": "double_redirect",
            "raw_data": ""
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

        let result = {
            stream_url: null,
            headers: {},
            agent: "ExoPlayer"
        };

        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                result.stream_url = innerData.url || null;
                if (innerData.headers) {
                    result.headers = innerData.headers;
                }
                if (innerData.agent) {
                    result.agent = innerData.agent;
                }
            } catch (e) {
                result.stream_url = jsonResponse.data.url;
            }
        }

        if (!result.stream_url && jsonResponse.raw_data) {
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
        }

        if (!result.stream_url && jsonResponse.raw_data) {
            const m3u8Match = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
            if (m3u8Match) {
                result.stream_url = m3u8Match[1];
            }
        }

        return result;

    } catch (error) {
        console.error("Error in double redirect:", error.message);
        return { error: true, message: error.message };
    }
}

// 1. مسار جلب القنوات حسب القسم (Topic)
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

// 2. مسار جلب روابط البث للقناة (Stream)
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const resolveAll = req.query.resolve === "true";
        
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
        const mainAgent = liveData.agent || "";
        
        if (mainUrl && mainUrl !== "empty") {
            let streamObj = {
                server_name: "السيرفر الأساسي",
                url: mainUrl,
                agent: mainAgent || "ExoPlayer",
                drm: null
            };

            if (resolveAll && mainAgent === "redirect") {
                try {
                    const resolved = await resolveRedirectServer(id_live, mainUrl);
                    if (resolved.stream_url) {
                        streamObj.url = resolved.stream_url;
                        streamObj.agent = resolved.agent || streamObj.agent;
                        streamObj.headers = resolved.headers;
                        streamObj.server_name += " ✅";
                    }
                } catch (err) {
                    console.error("Failed to resolve main server:", err.message);
                }
            }

            parsedStreams.push(streamObj);
        }

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
                        if (jsonObj.headers) {
                            streamObj.headers = jsonObj.headers;
                            if (jsonObj.headers["User-Agent"]) streamObj.agent = jsonObj.headers["User-Agent"];
                        }
                        if (jsonObj.drm) streamObj.drm = jsonObj.drm;
                    } catch (e) {
                        streamObj.url = linkData;
                    }
                } else {
                    streamObj.url = linkData;
                }

                if (resolveAll && streamObj.url) {
                    try {
                        let resolved = null;
                        if (agentData === "redirect") {
                            resolved = await resolveRedirectServer(id_live, streamObj.url);
                        } else if (agentData === "double_redirect") {
                            resolved = await resolveDoubleRedirect(id_live, linkData);
                        }
                        
                        if (resolved && resolved.stream_url) {
                            streamObj.url = resolved.stream_url;
                            streamObj.agent = resolved.agent || streamObj.agent;
                            streamObj.headers = resolved.headers || streamObj.headers;
                            streamObj.server_name += " ✅";
                        }
                    } catch (err) {
                        console.error(`Failed to resolve server ${i}:`, err.message);
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
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 🚨 المسار التجريبي الجديد الذي طلبته خطوة بخطوة 🚨
// ==========================================
app.get("/ref", async (req, res) => {
    try {
        // يمكنك تمرير الرابط في المتصفح هكذا:
        // /ref?url=http://.LS.V2live_tv_custom_handler_alwan1_description_DL_/s&id_live=live_tv_panel_...
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "live_tv_panel_985d709fdd1ab07f9f51c32558b49a50"; 

        if (!targetUrl) {
            return res.status(400).json({ error: true, message: "الرجاء تمرير الرابط الوهمي (url) في الاستعلام" });
        }

        // 1. تحويل الرابط الوهمي إلى التركيبة الصحيحة باستخدام الدالة الموجودة
const realUrl = targetUrl; // إرسال الرابط الخام مباشرة دون تحويله إلى JSON
        // 2. تجهيز البيانات (نفس البيانات ولكن لاحظ agent: redirect)
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
            "url": realUrl,
            "agent": "redirect", // النوع redirect العادي
            "raw_data": ""
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));

        // 3. إرسال الطلب إلى الرابط المخصص للـ redirect العادي
        const response = await axios.post(
            "http://redirect.1spbgmu.com/redirect/getLiveByRedirect", // لاحظ الرابط هنا
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

        // النص المشفر القادم من السيرفر
        const encryptedResponseText = Buffer.from(response.data).toString("utf-8");
        
        // فك التشفير لنتمكن من رؤيته
        const decryptedText = decryptAES(encryptedResponseText);
        const jsonResponse = JSON.parse(decryptedText);

        // 4. عرض النتيجة لك تماماً كما هي (مشفرة ومفكوك تشفيرها) لتتأكد
        res.json({
            step: "Testing getLiveByRedirect",
            sent_url: realUrl,
            encrypted_raw_response: encryptedResponseText,
            decrypted_raw_response: jsonResponse
        });

    } catch (error) {
        console.error("Error in /ref:", error.message);
        res.status(500).json({ error: true, message: error.message });
    }
});


app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
