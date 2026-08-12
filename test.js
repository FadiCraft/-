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
    realUrl = `{"url":"https://hamis.romponalis.st/premiumtv/daddy4.php?id=${daddyId}","data":"","acceptSSL":"1","iframe":"https://daddylive.mov/embed/embed.php?id=${daddyId}&player=1&source=tv.json","headers":{"Referer":"https://dlhd.pk/","Origin":"https://dlhd.pk","Accept":"*/*","Sec-Fetch-Dest":"empty","Sec-Fetch-Mode":"cors","Sec-Fetch-Site":"cross-site"}}`;
} else {
        realUrl = `{"url":"${fakeUrl}","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
    }
    return realUrl;
}

// ==========================================
// القيم الافتراضية
// ==========================================
const DEFAULT_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const DEFAULT_HEADERS = {
    "User-Agent": DEFAULT_AGENT
};

// ==========================================
// 🆕 دالة: استخراج جميع البيانات من data.url (آخر رد)
// ==========================================
function parseDataUrl(dataUrl, fallbackAgent) {
    try {
        const obj = JSON.parse(dataUrl);
        
        // 🎯 نجمع كل البيانات
        const streamUrl = obj.url || "";
        const agent = obj.agent || fallbackAgent || DEFAULT_AGENT;
        const mediatype = obj.mediatype || (streamUrl.includes(".mpd") ? "dash" : streamUrl.includes(".m3u8") ? "hls" : null);
        
        // 🎯 headers من الرد + نضيف User-Agent إذا مش موجود
        const headers = obj.headers || {};
        if (!headers["User-Agent"] && !headers["user-agent"]) {
            headers["User-Agent"] = agent;
        }
        
        return {
            url: streamUrl,
            agent: agent,
            headers: headers,
            drm: obj.drm || null,
            mediatype: mediatype,
            iframe: obj.iframe || null,
            acceptSSL: obj.acceptSSL || null
        };
    } catch (e) {
        return {
            url: dataUrl,
            agent: fallbackAgent || DEFAULT_AGENT,
            headers: { ...DEFAULT_HEADERS },
            drm: null,
            mediatype: null,
            iframe: null,
            acceptSSL: null
        };
    }
}

// ==========================================
// دالة: إنشاء هيكل موحد للسيرفر
// ==========================================
function createServerObject(serverName, url, agent, headers, drm, mediatype) {
    return {
        server_name: serverName,
        url: url || "",
        agent: agent || DEFAULT_AGENT,
        drm: drm || null,
        headers: (headers && Object.keys(headers).length > 0) ? headers : { ...DEFAULT_HEADERS },
        mediatype: mediatype || null
    };
}

// ==========================================
// دالة: زيارة رابط وسيط
// ==========================================
async function fetchIntermediateUrl(url, headers = {}, agent = null) {
    try {
        const requestHeaders = {
            "User-Agent": agent || DEFAULT_AGENT,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            ...headers
        };

        const response = await axios.get(url, {
            headers: requestHeaders,
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: s => s < 500
        });

        const html = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        
        let streamUrl = null;
        const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) streamUrl = m3u8Match[1];
        if (!streamUrl) {
            const mpdMatch = html.match(/(https?:\/\/[^\s"'<>]+\.mpd[^\s"'<>]*)/i);
            if (mpdMatch) streamUrl = mpdMatch[1];
        }
        if (!streamUrl) {
            const srcMatch = html.match(/source\s+src=["']([^"']+)["']/i) || html.match(/iframe\s+src=["']([^"']+)["']/i);
            if (srcMatch) streamUrl = srcMatch[1];
        }
        if (!streamUrl) {
            const b64 = html.match(/atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/);
            if (b64) {
                try { const d = Buffer.from(b64[1], 'base64').toString('utf-8'); if (d.startsWith("http")) streamUrl = d; } catch(e) {}
            }
        }

        return streamUrl ? {
            success: true,
            url: streamUrl,
            agent: agent || DEFAULT_AGENT,
            headers: headers || {},
            mediatype: streamUrl.includes(".mpd") ? "dash" : "hls"
        } : { success: false };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ==========================================
// دالة: إرسال طلب للسيرفر
// ==========================================
async function sendRequest(channelId, urlData, agent, encryptedRawData = "", endpoint = "getLiveByRedirect") {
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
        "agent": agent,
        "raw_data": encryptedRawData
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

    const encryptedResponse = Buffer.from(response.data).toString("utf-8");
    const decryptedResponse = decryptAES(encryptedResponse);
    const jsonResponse = JSON.parse(decryptedResponse);

    return {
        encrypted_response: encryptedResponse,
        decrypted_response: jsonResponse
    };
}

// ==========================================
// 🆕 دالة: حل رابط redirect - ترجع البيانات كاملة من آخر رد
// ==========================================
async function resolveRedirectUrl(channelId, fakeUrl) {
    let currentUrl = fakeUrl;
    let currentAgent = "redirect";
    let encryptedRawData = "";
    let maxSteps = 5;
    
    // 🎯 آخر data.url مفكوك (اللي فيه كل البيانات)
    let lastParsedData = null;

    while (maxSteps > 0) {
        maxSteps--;
        
        let urlToSend = currentUrl;
        if (currentUrl.includes(".LS.V2") && currentUrl.endsWith("/s")) {
            urlToSend = convertFakeUrlToRealUrl(currentUrl, channelId);
        }

        let endpoint = (currentAgent === "double_redirect") ? "getLiveByDoubleRedirect" : "getLiveByRedirect";

        const result = await sendRequest(channelId, urlToSend, currentAgent, encryptedRawData, endpoint);
        const data = result.decrypted_response.data;
        
        if (!data || !data.url) return null;

        const newAgent = data.agent || "stop";
        
        // 🎯 نفك data.url ونحتفظ فيه
        const parsed = parseDataUrl(data.url, null);
        lastParsedData = parsed; // دائماً نحتفظ بآخر رد
        
        if (newAgent === "advanced" || newAgent === "stop") {
            
            // رابط LS.V2 ➔ نجرب raw_data
            if (parsed.url && parsed.url.includes(".LS.V2")) {
                if (result.encrypted_response && !encryptedRawData) {
                    encryptedRawData = result.encrypted_response.trim();
                    currentUrl = data.url;
                    currentAgent = "double_redirect";
                    continue;
                }
                break;
            }
            
            // رابط m3u8/mpd مباشر ➔ نرجع البيانات من data.url
            if (parsed.url && (parsed.url.includes(".m3u8") || parsed.url.includes(".mpd"))) {
                return {
                    url: parsed.url,
                    agent: parsed.agent,
                    headers: parsed.headers,
                    drm: parsed.drm,
                    mediatype: parsed.mediatype
                };
            }
            
            // رابط http وسيط ➔ نزوره ونستخدم headers من data.url
            if (parsed.url && parsed.url.startsWith("http")) {
                const fetchResult = await fetchIntermediateUrl(parsed.url, parsed.headers, parsed.agent);
                
                if (fetchResult.success) {
                    // 🎯 نرجع الرابط المستخرج + headers من data.url الأصلي
                    return {
                        url: fetchResult.url,
                        agent: parsed.agent,
                        headers: parsed.headers,
                        drm: parsed.drm,
                        mediatype: fetchResult.mediatype
                    };
                }
                
                // iframe
                if (parsed.iframe && parsed.iframe.startsWith("http")) {
                    const iframeResult = await fetchIntermediateUrl(parsed.iframe, parsed.headers, parsed.agent);
                    if (iframeResult.success) {
                        return {
                            url: iframeResult.url,
                            agent: parsed.agent,
                            headers: parsed.headers,
                            drm: parsed.drm,
                            mediatype: iframeResult.mediatype
                        };
                    }
                }
                
                // raw_data
                if (result.encrypted_response && !encryptedRawData) {
                    encryptedRawData = result.encrypted_response.trim();
                    currentUrl = data.url;
                    currentAgent = "double_redirect";
                    continue;
                }
                
                break;
            }
            
            // raw_data
            if (result.encrypted_response && !encryptedRawData) {
                encryptedRawData = result.encrypted_response.trim();
                currentUrl = data.url;
                currentAgent = "double_redirect";
                continue;
            }
            
            break;
        }
        
        if (newAgent === "redirect" || newAgent === "double_redirect") {
            currentUrl = data.url;
            currentAgent = newAgent;
            encryptedRawData = "";
            continue;
        }
        
        break;
    }

    // 🎯 إذا ما وصلنا لـ m3u8/mpd، نرجع آخر data.url مفكوك
    if (lastParsedData && lastParsedData.url && lastParsedData.url.startsWith("http")) {
        return {
            url: lastParsedData.url,
            agent: lastParsedData.agent,
            headers: lastParsedData.headers,
            drm: lastParsedData.drm,
            mediatype: lastParsedData.mediatype
        };
    }

    return null;
}

// ==========================================
// 🆕 دالة: معالجة سيرفر واحد
// ==========================================
async function processServer(id_live, serverName, urlData, agentData) {
    
    if (urlData && urlData.startsWith("{")) {
        // JSON - نفكها
        let parsed;
        try {
            const obj = JSON.parse(urlData);
            parsed = {
                url: obj.url || "",
                agent: obj.agent || agentData,
                headers: obj.headers || {},
                drm: obj.drm || null,
                mediatype: obj.mediatype || null
            };
        } catch(e) {
            parsed = { url: urlData, agent: agentData, headers: {}, drm: null, mediatype: null };
        }
        
        const isRedirect = (parsed.agent === "redirect" || agentData === "redirect");
        
        if (isRedirect && parsed.url) {
            console.log(`🔄 حل ${serverName}...`);
            const resolved = await resolveRedirectUrl(id_live, parsed.url);
            
            if (resolved && resolved.url && (resolved.url.includes(".m3u8") || resolved.url.includes(".mpd"))) {
                // ✅ نجاح - نرجع مع headers من الاستخراج
                return createServerObject(
                    serverName + " ",
                    resolved.url,
                    resolved.agent,
                    resolved.headers,
                    resolved.drm || parsed.drm,
                    resolved.mediatype
                );
            } else if (resolved && resolved.url) {
                // رابط مستخرج لكن مش m3u8/mpd
                return createServerObject(
                    serverName + " ⚠️",
                    resolved.url,
                    resolved.agent,
                    resolved.headers,
                    resolved.drm || parsed.drm,
                    resolved.mediatype
                );
            } else {
                // فشل
                return createServerObject(
                    serverName + "",
                    parsed.url,
                    parsed.agent,
                    parsed.headers,
                    parsed.drm,
                    parsed.mediatype
                );
            }
        } else {
            // مش redirect
            return createServerObject(
                serverName,
                parsed.url,
                parsed.agent,
                parsed.headers,
                parsed.drm,
                parsed.mediatype
            );
        }
    }
    
    // مش JSON
    const isRedirect = (agentData === "redirect");
    
    if (isRedirect) {
        console.log(`🔄 حل ${serverName}...`);
        const resolved = await resolveRedirectUrl(id_live, urlData);
        
        if (resolved && resolved.url && (resolved.url.includes(".m3u8") || resolved.url.includes(".mpd"))) {
            return createServerObject(
                serverName + "",
                resolved.url,
                resolved.agent,
                resolved.headers,
                resolved.drm,
                resolved.mediatype
            );
        } else if (resolved && resolved.url) {
            return createServerObject(
                serverName + " ",
                resolved.url,
                resolved.agent || DEFAULT_AGENT,
                resolved.headers || DEFAULT_HEADERS,
                resolved.drm,
                resolved.mediatype
            );
        } else {
            return createServerObject(
                serverName + " ",
                "",
                DEFAULT_AGENT,
                DEFAULT_HEADERS,
                null,
                null
            );
        }
    }
    
    return createServerObject(serverName, urlData, agentData, {}, null, null);
}

// ==========================================
// 1. مسار جلب القنوات
// ==========================================
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
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic", encryptedBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
            timeout: 30000
        });
        const jsonResponse = JSON.parse(decryptAES(response.data));
        let rawChannels = Array.isArray(jsonResponse) ? jsonResponse : (jsonResponse.channels || jsonResponse.live || []);
        const formattedChannels = rawChannels.map(ch => ({
            type: ch.type || "tv", id_live: ch.id_live || "", name: ch.name || "",
            url: ch.url || "", agent: ch.agent || "", backup: ch.backup || "",
            img_url: ch.img_url || "", id_topic: ch.id_topic || topic
        }));
        res.json(formattedChannels);
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});



// ==========================================
// مسار /stream 
// (المسار الرئيسي: يعرض كل السيرفرات بهيكل المشغل)
// (طلب سيرفر محدد مثل &s1: يعرض الرد الخام المفكوك من السيرفر كما هو)
// ==========================================
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });
        }

        // التحقق مما إذا كان هناك طلب لسيرفر محدد (مثل &s1 أو &s2)
        let requestedServerIndex = -1;
        for (const key in req.query) {
            if (key.match(/^s\d+$/)) {
                requestedServerIndex = parseInt(key.substring(1)) - 1;
                break;
            }
        }

        console.log(`📺 جلب القناة: ${id_live} ${requestedServerIndex !== -1 ? `[طلب الرد الخام لسيرفر s${requestedServerIndex + 1}]` : '[هيكل المشغل الكامل]'}`);

        // 1. جلب البيانات الأساسية من السيرفر الأول
        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
            "device_api": "28", "version_name": "187", "language": "ar",
            "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
            "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":468,\"adsLoaded\":240,\"adsShowed\":116,\"runCount\":54}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv", "id_live": id_live, "id": id_live, "live_id": id_live, "channel_id": id_live
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedBody, {
            headers: { 
                "Content-Type": "text/plain", 
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", 
                "Host": "live.1spbgmu.com", 
                "Connection": "Keep-Alive" 
            },
            timeout: 15000, 
            responseType: "arraybuffer" 
        });

        const decryptedResponse = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const rawJson = JSON.parse(decryptedResponse);
        const liveData = rawJson.live || {};

        // 2. تجميع كل الروابط الخام (الأساسي + الاحتياطية)
        let rawStreams = [];

        if (liveData.url && liveData.url !== "empty") {
            rawStreams.push({ url: liveData.url, agent: liveData.agent || "" });
        }

        if (liveData.backup) {
            const backupParts = liveData.backup.split("-;-");
            for (const part of backupParts) {
                const trimmedPart = part.trim();
                if (!trimmedPart) continue;
                
                const subParts = trimmedPart.split("--");
                const linkData = subParts[0] ? subParts[0].trim() : "";
                const agentData = subParts[1] ? subParts[1].trim() : "";
                
                if (linkData && linkData !== "empty") {
                    rawStreams.push({ url: linkData, agent: agentData });
                }
            }
        }

        // =======================================================
        // الحالة الأولى: المستخدم طلب سيرفر محدد (عرض الرد الخام)
        // =======================================================
        if (requestedServerIndex !== -1) {
            if (requestedServerIndex >= rawStreams.length) {
                return res.status(404).json({
                    error: true,
                    message: `السيرفر s${requestedServerIndex + 1} غير متوفر. المتاح: ${rawStreams.length} سيرفرات`
                });
            }

            const targetStream = rawStreams[requestedServerIndex];

            if (targetStream.agent === "redirect") {
                const redirectPayload = {
                    "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
                    "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
                    "device_api": "28", "version_name": "187", "language": "ar",
                    "timezone": "Europe/Istanbul", "device_type": "phone",
                    "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
                    "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
                    "appCount": "{\"adsFailed\":468,\"adsLoaded\":240,\"adsShowed\":116,\"runCount\":54}",
                    "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
                    "id": id_live,
                    "url": targetStream.url, 
                    "agent": "redirect"
                };

                const encryptedRedirectBody = encryptAES(JSON.stringify(redirectPayload));
                const redirectRes = await axios.post("http://redirect.1spbgmu.com/redirect/getLiveByRedirect", encryptedRedirectBody, {
                    headers: { 
                        "Content-Type": "text/plain", 
                        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", 
                        "Host": "redirect.1spbgmu.com", 
                        "Connection": "Keep-Alive" 
                    },
                    timeout: 15000, 
                    responseType: "arraybuffer"
                });

                // فك التشفير وعرضه مباشرة كما هو من السيرفر
                const decryptedStr = decryptAES(Buffer.from(redirectRes.data).toString("utf-8"));
                const parsedRedirect = JSON.parse(decryptedStr);
                
                return res.json(parsedRedirect);
            } else {
                return res.json({
                    message: `السيرفر s${requestedServerIndex + 1} ليس redirect`,
                    raw_data: targetStream
                });
            }
        }

        // =======================================================
        // الحالة الثانية: المسار الرئيسي بدون تحديد (تطبيق هيكل المشغل)
        // =======================================================
        let finalStreamsList = [];
        let serverCounter = 1;

        for (const item of rawStreams) {
            let streamDataObj = null;

            if (item.agent === "redirect") {
                try {
                    const redirectPayload = {
                        "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
                        "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
                        "device_api": "28", "version_name": "187", "language": "ar",
                        "timezone": "Europe/Istanbul", "device_type": "phone",
                        "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
                        "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
                        "appCount": "{\"adsFailed\":468,\"adsLoaded\":240,\"adsShowed\":116,\"runCount\":54}",
                        "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
                        "id": id_live,
                        "url": item.url,
                        "agent": "redirect"
                    };

                    const encryptedRedirectBody = encryptAES(JSON.stringify(redirectPayload));
                    const redirectRes = await axios.post("http://redirect.1spbgmu.com/redirect/getLiveByRedirect", encryptedRedirectBody, {
                        headers: { 
                            "Content-Type": "text/plain", 
                            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", 
                            "Host": "redirect.1spbgmu.com", 
                            "Connection": "Keep-Alive" 
                        },
                        timeout: 15000, 
                        responseType: "arraybuffer"
                    });

                    const decryptedStr = decryptAES(Buffer.from(redirectRes.data).toString("utf-8"));
                    const parsedRedirect = JSON.parse(decryptedStr);

                    if (parsedRedirect.data && parsedRedirect.data.url) {
                        try {
                            streamDataObj = JSON.parse(parsedRedirect.data.url);
                        } catch (e) {
                            streamDataObj = { url: parsedRedirect.data.url };
                        }
                    }
                } catch (err) {
                    console.error(`❌ خطأ أثناء جلب redirect للسيرفر ${serverCounter}:`, err.message);
                }
            } else {
                try {
                    streamDataObj = JSON.parse(item.url);
                } catch (e) {
                    streamDataObj = { url: item.url };
                }
            }

            if (streamDataObj) {
                const finalUrl = streamDataObj.url || "";
                const finalAgent = streamDataObj.agent || item.agent || DEFAULT_USER_AGENT;
                
                let finalHeaders = streamDataObj.headers || {};
                if (!finalHeaders["User-Agent"] && !finalHeaders["user-agent"]) {
                    finalHeaders["User-Agent"] = finalAgent;
                }

                let finalMediaType = streamDataObj.mediatype || null;
                if (!finalMediaType && finalUrl) {
                    if (finalUrl.includes(".m3u8")) finalMediaType = "hls";
                    else if (finalUrl.includes(".mpd")) finalMediaType = "dash";
                }

                finalStreamsList.push({
                    "server_name": `سيرفر ${serverCounter++}`,
                    "url": finalUrl,
                    "agent": finalAgent,
                    "drm": streamDataObj.drm || null,
                    "headers": finalHeaders,
                    "mediatype": finalMediaType
                });
            } else {
                serverCounter++;
            }
        }

        res.json({
            "id_live": liveData.id_live || id_live,
            "name": liveData.name || "",
            "img_url": liveData.img_url || "",
            "streams": finalStreamsList
        });

    } catch (error) { 
        const status = error.response ? error.response.status : null;
        console.error(`❌ خطأ في مسار /stream: ${status || error.message}`);
        
        res.status(500).json({ 
            error: true, 
            message: status ? `السيرفر الأساسي رد بخطأ: ${status}` : error.message 
        }); 
    }
});







// ==========================================
// 1. مسار POST: استخراج رد مفكوك التشفير (مع جلب التوكن الذكي)
// ==========================================
app.post("/get-redirect-data", async (req, res) => {
    try {
        const id_live = req.body.id_live;
        let url = req.body.url;
        const agent = req.body.agent || "redirect";

        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في الـ Body" });
        }

        if (!url) {
            const streamsPostData = {
                "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
                "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
                "device_api": "28", "version_name": "187", "language": "ar",
                "timezone": "Europe/Istanbul", "device_type": "phone",
                "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
                "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
                "type": "tv", "id_live": id_live, "id": id_live, "live_id": id_live, "channel_id": id_live
            };
            
            const encryptedStreamBody = encryptAES(JSON.stringify(streamsPostData));
            const streamRes = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedStreamBody, {
                headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
                responseType: "arraybuffer",
                timeout: 15000
            });
            
            const decryptedStreamRes = decryptAES(Buffer.from(streamRes.data).toString("utf-8"));
            const streamJson = JSON.parse(decryptedStreamRes);
            url = streamJson.live?.url;

            if (!url || url === "empty") {
                return res.status(404).json({ error: true, message: "لم يتم العثور على رابط أساسي لهذه القناة لإرساله" });
            }
        }

        // المحاولة الأولى
        let result = await sendRequest(id_live, url, agent, "", "getLiveByRedirect");
        let responseData = result.decrypted_response;
        let returnedUrl = responseData?.data?.url || "";

        // 🎯 الفحص الذكي المطور (مع استخراج التوكن)
        let isDirectStream = false;
        let actualUrlObj = {};
        let actualUrl = returnedUrl;
        let actualHeaders = {};

        try {
            actualUrlObj = JSON.parse(returnedUrl);
            actualUrl = actualUrlObj.url || returnedUrl;
            actualHeaders = actualUrlObj.headers || {};
        } catch(e) {}

        const isGateway = actualUrl.includes("token.") || actualUrl.includes("?url=") || actualUrl.includes(".LS.V2");
        const hasStreamExt = actualUrl.includes(".m3u8") || actualUrl.includes(".mpd");

        if (hasStreamExt && !isGateway && returnedUrl !== "1") {
            isDirectStream = true;
        }

        if (!isDirectStream && returnedUrl !== "1") {
            console.log(`🔄 [POST] الرابط غير مباشر، جاري تجهيز الخطوة الوسيطة...`);
            let rawData = "";

            if (actualUrl.includes("token.easybroadcast.io")) {
                try {
                    console.log(`🔑 جاري استخراج التوكن من سيرفر EasyBroadcast...`);
                    const tokenRes = await axios.get(actualUrl, { headers: actualHeaders });
                    
                    if (tokenRes.data && typeof tokenRes.data === 'object') {
                        rawData = Object.keys(tokenRes.data)
                            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(tokenRes.data[key])}`)
                            .join('&');
                    } else if (typeof tokenRes.data === 'string') {
                        rawData = tokenRes.data;
                    }
                } catch (err) {
                    console.log(`⚠️ فشل جلب التوكن: ${err.message}`);
                }
            } else if (result.encrypted_response) {
                rawData = result.encrypted_response.trim();
            }

            const nextAgent = "double_redirect";
            result = await sendRequest(id_live, returnedUrl, nextAgent, rawData, "getLiveByDoubleRedirect");
        }

        res.json(result.decrypted_response);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});


// ==========================================
// 2. مسار GET: جلب الرد مفكوك التشفير (مع جلب التوكن الذكي)
// ==========================================
app.get("/get-redirect-data", async (req, res) => {
    try {
        const id_live = req.query.id_live;

        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في الرابط" });
        }

        console.log(`🔍 [GET] جلب الرابط الأساسي لقناة: ${id_live}`);

        const streamsPostData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
            "device_api": "28", "version_name": "187", "language": "ar",
            "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv", "id_live": id_live, "id": id_live, "live_id": id_live, "channel_id": id_live
        };
        
        const encryptedStreamBody = encryptAES(JSON.stringify(streamsPostData));
        const streamRes = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedStreamBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
            responseType: "arraybuffer",
            timeout: 15000
        });
        
        const decryptedStreamRes = decryptAES(Buffer.from(streamRes.data).toString("utf-8"));
        const streamJson = JSON.parse(decryptedStreamRes);
        const url = streamJson.live?.url;

        if (!url || url === "empty") {
            return res.status(404).json({ error: true, message: "لم يتم العثور على رابط أساسي لهذه القناة" });
        }

        // المحاولة الأولى
        let result = await sendRequest(id_live, url, "redirect", "", "getLiveByRedirect");
        let responseData = result.decrypted_response;
        let returnedUrl = responseData?.data?.url || "";

        // 🎯 الفحص الذكي المطور (مع استخراج التوكن)
        let isDirectStream = false;
        let actualUrlObj = {};
        let actualUrl = returnedUrl;
        let actualHeaders = {};

        try {
            actualUrlObj = JSON.parse(returnedUrl);
            actualUrl = actualUrlObj.url || returnedUrl;
            actualHeaders = actualUrlObj.headers || {};
        } catch(e) {}

        const isGateway = actualUrl.includes("token.") || actualUrl.includes("?url=") || actualUrl.includes(".LS.V2");
        const hasStreamExt = actualUrl.includes(".m3u8") || actualUrl.includes(".mpd");

        if (hasStreamExt && !isGateway && returnedUrl !== "1") {
            isDirectStream = true;
        }

        if (!isDirectStream && returnedUrl !== "1") {
            console.log(`🔄 [GET] الرابط غير مباشر، جاري تجهيز الخطوة الوسيطة...`);
            let rawData = "";

            if (actualUrl.includes("token.easybroadcast.io")) {
                try {
                    console.log(`🔑 جاري استخراج التوكن من سيرفر EasyBroadcast...`);
                    const tokenRes = await axios.get(actualUrl, { headers: actualHeaders });
                    
                    if (tokenRes.data && typeof tokenRes.data === 'object') {
                        rawData = Object.keys(tokenRes.data)
                            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(tokenRes.data[key])}`)
                            .join('&');
                    } else if (typeof tokenRes.data === 'string') {
                        rawData = tokenRes.data;
                    }
                } catch (err) {
                    console.log(`⚠️ فشل جلب التوكن: ${err.message}`);
                }
            } else if (result.encrypted_response) {
                rawData = result.encrypted_response.trim();
            }

            const nextAgent = "double_redirect";
            result = await sendRequest(id_live, returnedUrl, nextAgent, rawData, "getLiveByDoubleRedirect");
        }

        res.json(result.decrypted_response);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});






// ==========================================
// 🆕 المسار الذكي المدمج (المحسن مع فحص الروابط الفارغة)
// ==========================================
app.get("/live_id/:id", async (req, res) => {
    try {
        const id_live = req.params.id;
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id في الرابط" });
        }

        console.log(`🤖 [المسار الذكي] جاري فحص القناة: ${id_live}`);

        const localBaseUrl = `http://localhost:${PORT}`;

        // 1. المحاولة الأولى: استدعاء مسار /get-redirect-data الداخلي
        try {
            const redirectResponse = await axios.get(`${localBaseUrl}/get-redirect-data?id_live=${id_live}`);
            const redirectData = redirectResponse.data;
            const returnedUrl = redirectData?.data?.url || "";

            // إذا كان الرابط موجوداً وليس "1"، نرجعه فوراً
            if (returnedUrl && returnedUrl !== "1" && returnedUrl !== "empty") {
                console.log(`✅ [المسار الذكي] تم الحصول على رابط مباشر للقناة ${id_live}`);
                return res.json(redirectData);
            }
        } catch (err) {
            console.log(`⚠️ فشل أو خطأ في مسار Redirect، سيتم الانتقال لمسار Stream...`);
        }

        // 2. المحاولة الثانية: استدعاء مسار /stream الداخلي
        console.log(`🔄 [المسار الذكي] النتيجة غير صالحة (1)، جاري استدعاء مسار السيرفرات الكاملة...`);
        const streamResponse = await axios.get(`${localBaseUrl}/stream?id_live=${id_live}`);
        const streamData = streamResponse.data;

        // 🎯 3. الفحص الذكي: هل الروابط داخل السيرفرات فارغة تماماً؟
        let hasValidStreams = false;
        if (streamData && Array.isArray(streamData.streams)) {
            hasValidStreams = streamData.streams.some(server => server.url && server.url.trim() !== "");
        }

        // إذا كانت الروابط موجودة وصالحة، نرجها كما هي
        if (hasValidStreams) {
            console.log(`✅ [المسار الذكي] تم العثور على سيرفرات تعمل للقناة ${id_live}`);
            return res.json(streamData);
        }

        // 4. الخطة البديلة النهائية: إذا كانت كل الروابط فارغة، استدعاء مسار /last/
        console.log(`⚠️ تحذير: جميع السيرفرات فارغة! جاري التحويل إلى مسار البديل /last/ لقناة: ${id_live}`);
        
        try {
            // استبدل هذا الرابط بالمسار الفعلي لـ /last/ لديك (سواء داخلي أو دالة برمجية)
            const lastResponse = await axios.get(`${localBaseUrl}/last/${id_live}`);
            return res.json(lastResponse.data);
        } catch (lastErr) {
            // إذا فشل مسار /last أو لم يكن موجوداً، نرجع هيكل الـ streams الفارغ كخطة أخيرة
            console.log(`❌ فشل مسار /last: ${lastErr.message}`);
            return res.json(streamData);
        }

    } catch (error) {
        res.status(500).json({ error: true, message: "حدث خطأ أثناء معالجة المسار الذكي: " + error.message });
    }
});








// ==========================================
// مسار مشترك: جلب بيانات الـ Redirect وإذا فشلت (url="1") ينتقل لجلب الـ Stream
// ==========================================
app.get("/last/:id_live", async (req, res) => {
    try {
        const id_live = req.params.id_live;
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في المسار" });
        }

        console.log(`🚀 بدء معالجة المسار المشترك لقناة: ${id_live}`);

        // 1. جلب بيانات البث الأساسية (نفس الطلب في /stream لمعرفة الرابط الأساسي والسيرفرات البديلة)
        const streamsPostData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3",
            "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604",
            "device_api": "28", "version_name": "187", "language": "ar",
            "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct",
            "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv", "id_live": id_live, "id": id_live, "live_id": id_live, "channel_id": id_live
        };
        
        const encryptedStreamBody = encryptAES(JSON.stringify(streamsPostData));
        
        const streamRes = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedStreamBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
            responseType: "arraybuffer",
            timeout: 15000
        });
        
        const decryptedStreamRes = decryptAES(Buffer.from(streamRes.data).toString("utf-8"));
        const streamJson = JSON.parse(decryptedStreamRes);
        const liveData = streamJson.live || {};
        const url = liveData.url;

        if (!url || url === "empty") {
            return res.status(404).json({ error: true, message: "لم يتم العثور على رابط أساسي لهذه القناة" });
        }

        // 2. إرسال الطلب للحصول على بيانات getLiveByRedirect أولاً
        const redirectResult = await sendRequest(id_live, url, "redirect", "", "getLiveByRedirect");
        const redirectData = redirectResult.decrypted_response;

        let urlVal = "";
        if (redirectData && redirectData.data && redirectData.data.url) {
            urlVal = redirectData.data.url.trim();
        }

        // 3. التحقق من الرد: هل هو التفصيلي أم القيمة "1"؟
        if (urlVal !== "1" && urlVal !== "" && urlVal !== "empty") {
            // ✅ الرد يحتوي على الداتا الكاملة، نرجعها مباشرة للعميل
            return res.json(redirectData);
        } else {
            // ⚠️ الرد كان "1"، سننتقل لتنفيذ عملية /stream
            console.log(`⚠️ الرد التوجيهي كان ("1")، سيتم تشغيل وظيفة الـ stream الأساسية لقناة: ${id_live}`);
            
            let parsedStreams = [];
            const mainUrl = liveData.url || "";
            const mainAgent = liveData.agent || "";
            
            if (mainUrl && mainUrl !== "empty") {
                const server = await processServer(id_live, "السيرفر الأساسي", mainUrl, mainAgent);
                parsedStreams.push(server);
            }

            const backupStr = liveData.backup || "";
            if (backupStr) {
                const backupParts = backupStr.split("-;-");
                for (let i = 0; i < backupParts.length; i++) {
                    const part = backupParts[i].trim();
                    if (!part) continue;
                    
                    const subParts = part.split("--");
                    const linkData = subParts[0] ? subParts[0].trim() : "";
                    const agentData = subParts[1] ? subParts[1].trim() : "";
                    
                    if (!linkData || linkData === "empty") continue;
                    const server = await processServer(id_live, `سيرفر ${parsedStreams.length + 1}`, linkData, agentData);
                    parsedStreams.push(server);
                }
            }

            // إرجاع مخرجات الـ Stream المجهزة بالكامل بدون الدخول في حلقات تحقق إضافية تبطئ السرعة
            return res.json({
                id_live: liveData.id_live || id_live,
                name: liveData.name || "",
                img_url: liveData.img_url || "",
                streams: parsedStreams
            });
        }

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});


















// ==========================================
// 4. مسار جلب المباريات (مفكوك التشفير ومبسط)
// ==========================================
app.get("/mach", async (req, res) => {
    try {
        console.log(`⚽ جلب بيانات المباريات...`);

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
            "type": "tv"
        };

        const encryptedBody = encryptAES(JSON.stringify(postData));

        const response = await axios.post("http://sport.1spbgmu.com/sport/getMatches", encryptedBody, {
            headers: { 
                "Content-Type": "text/plain", 
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", 
                "Host": "sport.1spbgmu.com", 
                "Connection": "Keep-Alive" 
            },
            timeout: 30000,
            responseType: "arraybuffer"
        });

        const encryptedResponse = Buffer.from(response.data).toString("utf-8");
        const decryptedResponse = decryptAES(encryptedResponse);
        const jsonResponse = JSON.parse(decryptedResponse);

        let rawMatches = Array.isArray(jsonResponse) ? jsonResponse : (jsonResponse.matches || jsonResponse.data || []);

        // 🎯 الاستخراج المحدث ليتوافق مع الـ JSON الفعلي
        const formattedMatches = rawMatches.map(match => {
            // تنظيف الوقت وحالة المباراة
            let matchTime = "";
            let matchStatus = "لم تبدأ";
            let dateVal = match.date || "";
            
            if (dateVal.includes("انتهت")) {
                matchStatus = "انتهت";
                matchTime = "انتهت";
            } else {
                // استخراج الوقت من النص مثل "(Istanbul 22:00)"
                const timeMatch = dateVal.match(/\d{2}:\d{2}/);
                if (timeMatch) matchTime = timeMatch[0];
                else matchTime = dateVal;
            }

            // التعامل مع النتيجة (Score)
            let finalScore = "";
            if (match.firstTeamScore && match.firstTeamScore !== "-") {
                finalScore = match.firstTeamScore; // أحياناً المصدر يعطي النتيجة كـ "3-1" مباشرة
            }

            return {
                title: match.title || "",
                league: match.topic || "",
                team1: match.firstTeam || "",
                team2: match.secondtTeam || "", // الانتباه للخطأ الإملائي من المصدر
                team1_logo: match.firstTeamImage || "",
                team2_logo: match.secondtTeamImage || "",
                time: matchTime,
                date: dateVal,
                status: matchStatus,
                score: finalScore,
                channel: match.channel || "",
                id_live: match.channel || "" // نستخدم المفتاح channel كمعرف للبث (id_live)
            };
        });

        res.json(formattedMatches);

    } catch (error) { 
        console.error('Error fetching matches:', error.message);
        res.status(500).json({ error: true, message: error.message }); 
    }
});









// ==========================================
// 3. /resolve و /extract
// ==========================================
app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url;
        const channelId = req.query.id_live || req.body.id_live || "test";
        if (!targetUrl) return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json(result ? { success: true, ...result } : { error: true, message: "فشل" });
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});

app.get("/extract", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "test";
        if (!targetUrl) return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json({ success: result ? true : false, result: result });
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});

// قائمة الأقسام (Topics)
const allTopics = [
    {"id_topic":"hot_now","name_topic":"الأكثر مشاهدة","img_url_topic":"http://logo.twoapistack.work/img/topics/hot_now.png","code":""},
   
    {"id_topic":"alwan","name_topic":"الوان","img_url_topic":"http://logo.twoapistack.work/img/topics/alwan.jpg","code":""},
    {"id_topic":"shahid","name_topic":"شاهد","img_url_topic":"http://logo.twoapistack.work/img/topics/shahid.jpg","code":""},
    {"id_topic":"arabic_sport","name_topic":"رياضة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_basketball_red.png","code":""},
    {"id_topic":"ar_1","name_topic":"ترفيه عربي","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_featured_ar.png","code":""},
    {"id_topic":"ar_2","name_topic":"أخبار","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_newspaper.png","code":""},
    {"id_topic":"ar_3","name_topic":"أطفال","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_kids.jpg","code":""},
    {"id_topic":"ar_5","name_topic":"وثائقي","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_documantry.png","code":""},
    {"id_topic":"ar_6","name_topic":"ديني","img_url_topic":"http://logo.twoapistack.work/img/topics/ic__mosque.png","code":""},
    {"id_topic":"ar_7","name_topic":"أفلام","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_film.png","code":""},
    {"id_topic":"ar_8","name_topic":"موسيقى","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_music.jpg","code":""},
    {"id_topic":"art","name_topic":"ART","img_url_topic":"http://logo.twoapistack.work/img/topics/art.png","code":""},
    {"id_topic":"osn","name_topic":"OSN","img_url_topic":"http://logo.twoapistack.work/img/topics/osn_logo.png","code":""},
    {"id_topic":"netflix","name_topic":"NETFLIX","img_url_topic":"http://logo.twoapistack.work/img/topics/netflix.jpg","code":""},
    {"id_topic":"mbc","name_topic":"MBC","img_url_topic":"http://logo.twoapistack.work/img/topics/mpc.jpg","code":""},
    {"id_topic":"rotana","name_topic":"روتانا","img_url_topic":"http://logo.twoapistack.work/img/topics/rotana.jpg","code":""},
    {"id_topic":"cook","name_topic":"الطبخ","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_chef.png","code":""},
    {"id_topic":"weyyak","name_topic":"وياك","img_url_topic":"http://logo.twoapistack.work/img/topics/weyyak.jpg","code":""},
    {"id_topic":"bein_entir","name_topic":"بي ان ترفيه","img_url_topic":"http://logo.twoapistack.work/img/topics/bein_enter.jpg","code":""},
    {"id_topic":"bein_sport","name_topic":"بي ان سبورت","img_url_topic":"http://logo.twoapistack.work/img/topics/bein_sport.png","code":""},
    
    
    {"id_topic":"science","name_topic":"علوم","img_url_topic":"http://logo.twoapistack.work/img/topics/science.png","code":""},
    {"id_topic":"anime","name_topic":"انيمي","img_url_topic":"http://logo.twoapistack.work/img/topics/anime.jpg","code":""},
    {"id_topic":"roya","name_topic":"رؤيا","img_url_topic":"https://backend.roya-tv.com/imagechanger/Size01Q40R11/images/channels/iMoPuU3u5qnqMsL.png","code":""},
    {"id_topic":"963","name_topic":"سوريا","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_sy.png","code":"sy"},
    {"id_topic":"961","name_topic":"لبنان","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_lb.png","code":"lb"},
    {"id_topic":"966","name_topic":"السعودية","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_sa.png","code":"sa"},
    {"id_topic":"20","name_topic":"مصر","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_eg.png","code":"eg"},
    {"id_topic":"971","name_topic":"الإمارات العربية المتحدة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ae.png","code":"ae"},
    {"id_topic":"962","name_topic":"الأردن","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_jo.png","code":"jo"},
    {"id_topic":"974","name_topic":"قطر","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_qa.png","code":"qa"},
    {"id_topic":"964","name_topic":"العراق","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_iq.png","code":"iq"},
    {"id_topic":"965","name_topic":"الكويت","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_kw.png","code":"kw"},
    {"id_topic":"968","name_topic":"عُمان","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_om.png","code":"om"},
    {"id_topic":"967","name_topic":"اليمن","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ye.png","code":"ye"},
    {"id_topic":"973","name_topic":"البحرين","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bh.png","code":"bh"},
    {"id_topic":"970","name_topic":"فلسطين","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ps.png","code":"ps"},
    {"id_topic":"249","name_topic":"السودان","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_sd.png","code":""},
    {"id_topic":"216","name_topic":"تونس","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_tn.png","code":""},
    {"id_topic":"212","name_topic":"المغرب","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ma.png","code":""},
    {"id_topic":"213","name_topic":"الجزائر","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_dz.png","code":""},
    {"id_topic":"218","name_topic":"ليبيا","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ly.png","code":""},
    {"id_topic":"252","name_topic":"الصومال","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_so.png","code":""}
];

app.get("/get-all-topics", (req, res) => { res.json(allTopics); });

app.listen(PORT, () => { console.log("🚀 Server running on port " + PORT); });
