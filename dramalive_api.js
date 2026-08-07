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
        realUrl = `{"url":"https://hamis.romponalis.st/premiumtv/daddy4.php?id=${daddyId}","data":"","acceptSSL":"1","iframe":"https://daddylive.mov/embed/embed.php?id=${daddyId}&player=1&source=tv.json","headers":{"Referer":"https://dlhd.pk/"}}`;
    } else {
        realUrl = `{"url":"${fakeUrl}","data":"","acceptSSL":"1","iframe":"","headers":{}}`;
    }
    return realUrl;
}

function parseFinalUrl(dataUrl, agent) {
    try {
        const innerData = JSON.parse(dataUrl);
        return {
            stream_url: innerData.url || dataUrl,
            agent: innerData.agent || agent,
            headers: innerData.headers || {},
            mediatype: innerData.mediatype || null,
            acceptSSL: innerData.acceptSSL || null,
            iframe: innerData.iframe || null,
            swap: innerData.swap || null
        };
    } catch (e) {
        return {
            stream_url: dataUrl,
            agent: agent,
            headers: {},
            mediatype: null
        };
    }
}

// ==========================================
// 🆕 دالة: زيارة رابط وسيط واستخراج m3u8/mpd
// ==========================================
async function fetchIntermediateUrl(url, headers = {}, agent = null) {
    try {
        const requestHeaders = {
            "User-Agent": agent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            ...headers
        };

        console.log("🌐 زيارة الرابط الوسيط:", url);
        console.log("📋 Headers:", JSON.stringify(requestHeaders));

        const response = await axios.get(url, {
            headers: requestHeaders,
            timeout: 15000,
            maxRedirects: 5
        });

        const html = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        
        console.log("📄 HTML (first 500 chars):", html.substring(0, 500));

        // 🔍 البحث عن روابط m3u8/mpd في الـ HTML
        let streamUrl = null;
        
        // البحث عن m3u8
        const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) {
            streamUrl = m3u8Match[1];
            console.log("✅ وجدت m3u8:", streamUrl);
        }
        
        // البحث عن mpd
        if (!streamUrl) {
            const mpdMatch = html.match(/(https?:\/\/[^\s"'<>]+\.mpd[^\s"'<>]*)/i);
            if (mpdMatch) {
                streamUrl = mpdMatch[1];
                console.log("✅ وجدت mpd:", streamUrl);
            }
        }
        
        // البحث في source src
        if (!streamUrl) {
            const sourceMatch = html.match(/source\s+src=["']([^"']+)["']/i);
            if (sourceMatch) {
                streamUrl = sourceMatch[1];
                console.log("✅ وجدت source src:", streamUrl);
            }
        }
        
        // البحث في iframe src
        if (!streamUrl) {
            const iframeMatch = html.match(/iframe\s+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                streamUrl = iframeMatch[1];
                console.log("✅ وجدت iframe src:", streamUrl);
            }
        }

        // البحث عن base64 encoded URLs
        if (!streamUrl) {
            const base64Match = html.match(/atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/);
            if (base64Match) {
                try {
                    const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                    if (decoded.includes(".m3u8") || decoded.includes(".mpd") || decoded.startsWith("http")) {
                        streamUrl = decoded;
                        console.log("✅ وجدت base64 decoded URL:", streamUrl);
                    }
                } catch (err) {}
            }
        }

        if (!streamUrl) {
            console.log("❌ لم أجد أي رابط بث في الصفحة");
        }

        return {
            success: streamUrl ? true : false,
            stream_url: streamUrl,
            html_snippet: html.substring(0, 500)
        };

    } catch (error) {
        console.error("❌ خطأ في زيارة الرابط:", error.message);
        return {
            success: false,
            error: error.message,
            status_code: error.response?.status
        };
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
        encrypted_body: encryptedBody,
        encrypted_response: encryptedResponse,
        decrypted_body: postData,
        decrypted_response: jsonResponse
    };
}

// ==========================================
// 🆕 دالة: استخراج الرابط النهائي كاملة
// ==========================================
async function extractStreamUrl(channelId, initialUrl) {
    let currentUrl = initialUrl;
    let currentAgent = "redirect";
    let encryptedRawData = "";
    let steps = [];
    let finalResult = null;
    let maxSteps = 5;

    while (maxSteps > 0) {
        maxSteps--;
        
        let urlToSend = currentUrl;
        if (currentUrl.includes(".LS.V2") && currentUrl.endsWith("/s")) {
            urlToSend = convertFakeUrlToRealUrl(currentUrl, channelId);
        }

        let endpoint = (currentAgent === "double_redirect") ? "getLiveByDoubleRedirect" : "getLiveByRedirect";

        console.log(`🔄 Step [${currentAgent}] -> ${endpoint}`);
        
        const result = await sendRequest(channelId, urlToSend, currentAgent, encryptedRawData, endpoint);
        
        const data = result.decrypted_response.data;
        
        steps.push({
            agent_sent: currentAgent,
            endpoint: endpoint,
            had_raw_data: encryptedRawData ? true : false,
            decrypted_response: result.decrypted_response
        });

        if (!data || !data.url) break;

        const newAgent = data.agent || "stop";
        
        // 🔹 agent = advanced ➔ فك data.url
        if (newAgent === "advanced" || newAgent === "stop") {
            const parsed = parseFinalUrl(data.url, data.agent);
            
            // 🔹 إذا stream_url موجود لكنه رابط وسيط (مش m3u8/mpd) ➔ زوره
            if (parsed.stream_url && 
                parsed.stream_url.startsWith("http") &&
                !parsed.stream_url.includes(".m3u8") && 
                !parsed.stream_url.includes(".mpd") &&
                !parsed.stream_url.includes(".ts") &&
                !parsed.stream_url.includes(".mkv")) {
                
                console.log("🌐 الرابط الوسيط:", parsed.stream_url);
                console.log("📋 الـ headers:", JSON.stringify(parsed.headers));
                
                const fetchResult = await fetchIntermediateUrl(
                    parsed.stream_url,
                    parsed.headers,
                    parsed.agent
                );
                
                steps.push({
                    step: "fetch_intermediate",
                    url_visited: parsed.stream_url,
                    headers_used: parsed.headers,
                    result: fetchResult
                });
                
                if (fetchResult.success && fetchResult.stream_url) {
                    finalResult = {
                        stream_url: fetchResult.stream_url,
                        agent: parsed.agent,
                        headers: parsed.headers,
                        mediatype: "hls"
                    };
                    break;
                }
                
                // إذا فشلت الزيارة، جرب iframe
                if (parsed.iframe && parsed.iframe.startsWith("http")) {
                    console.log("🔄 نجرب iframe:", parsed.iframe);
                    const iframeResult = await fetchIntermediateUrl(
                        parsed.iframe,
                        parsed.headers,
                        parsed.agent
                    );
                    
                    steps.push({
                        step: "fetch_iframe",
                        url_visited: parsed.iframe,
                        headers_used: parsed.headers,
                        result: iframeResult
                    });
                    
                    if (iframeResult.success && iframeResult.stream_url) {
                        finalResult = {
                            stream_url: iframeResult.stream_url,
                            agent: parsed.agent,
                            headers: parsed.headers,
                            mediatype: "hls"
                        };
                        break;
                    }
                }
            }
            
            // إذا stream_url فيه m3u8/mpd ➔ خلاص
            if (parsed.stream_url && 
                (parsed.stream_url.includes(".m3u8") || 
                 parsed.stream_url.includes(".mpd") ||
                 parsed.stream_url.includes(".ts"))) {
                finalResult = parsed;
                break;
            }
            
            // إذا raw_data موجود ➔ نجرب
            if (result.encrypted_response && !encryptedRawData) {
                console.log("🔄 نجرب raw_data...");
                encryptedRawData = result.encrypted_response.trim();
                currentUrl = data.url;
                currentAgent = "double_redirect";
                continue;
            }
            
            finalResult = parsed;
            break;
        }
        
        // 🔹 agent = redirect أو double_redirect ➔ نكمل
        if (newAgent === "redirect" || newAgent === "double_redirect") {
            currentUrl = data.url;
            currentAgent = newAgent;
            encryptedRawData = "";
            continue;
        }
        
        finalResult = parseFinalUrl(data.url, data.agent);
        break;
    }

    return {
        success: finalResult && finalResult.stream_url && 
                 (finalResult.stream_url.includes(".m3u8") || 
                  finalResult.stream_url.includes(".mpd") ||
                  finalResult.stream_url.includes(".ts")) ? true : false,
        final_result: finalResult,
        steps: steps,
        total_steps: steps.length
    };
}

// ==========================================
// 🆕 مسار: /extract
// ==========================================
app.get("/extract", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "test";
        
        if (!targetUrl) {
            return res.status(400).json({ success: false, error: true, message: "يرجى إرسال الرابط (url)" });
        }

        console.log("🚀 بدء استخراج الرابط...");
        console.log("📌 الرابط:", targetUrl);

        const result = await extractStreamUrl(channelId, targetUrl);
        
        res.json(result);

    } catch (error) {
        res.status(500).json({ success: false, error: true, message: error.message });
    }
});

// ==========================================
// 🆕 مسار: /extract-simple
// ==========================================
app.get("/extract-simple", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "test";
        
        if (!targetUrl) {
            return res.status(400).json({ success: false, error: true, message: "يرجى إرسال الرابط (url)" });
        }

        const result = await extractStreamUrl(channelId, targetUrl);
        
        if (result.success && result.final_result) {
            res.json({
                success: true,
                stream_url: result.final_result.stream_url,
                headers: result.final_result.headers || {},
                agent: result.final_result.agent || "ExoPlayer",
                mediatype: result.final_result.mediatype || null
            });
        } else {
            res.json({ 
                success: false, 
                error: true, 
                message: "لم يتم العثور على رابط البث", 
                steps: result.steps 
            });
        }

    } catch (error) {
        res.status(500).json({ success: false, error: true, message: error.message });
    }
});

// ==========================================
// باقي المسارات كما هي
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
        let result = { stream_url: null, headers: {}, agent: "ExoPlayer" };
        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                result.stream_url = innerData.url || null;
                if (innerData.headers) result.headers = innerData.headers;
                if (innerData.agent) result.agent = innerData.agent;
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
            if (m3u8Match) result.stream_url = m3u8Match[1];
        }
        return result;
    } catch (error) {
        return { error: true, message: error.message };
    }
}

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
        let result = { stream_url: null, headers: {}, agent: "ExoPlayer" };
        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                result.stream_url = innerData.url || null;
                if (innerData.headers) result.headers = innerData.headers;
                if (innerData.agent) result.agent = innerData.agent;
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
            if (m3u8Match) result.stream_url = m3u8Match[1];
        }
        return result;
    } catch (error) {
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

// 2. مسار جلب روابط البث
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
            let streamObj = { server_name: "السيرفر الأساسي", url: mainUrl, agent: mainAgent || "ExoPlayer", drm: null };
            if (resolveAll && mainAgent === "redirect") {
                try {
                    const resolved = await resolveRedirectServer(id_live, mainUrl);
                    if (resolved.stream_url) {
                        streamObj.url = resolved.stream_url;
                        streamObj.agent = resolved.agent || streamObj.agent;
                        streamObj.headers = resolved.headers;
                        streamObj.server_name += " ✅";
                    }
                } catch (err) {}
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
                let streamObj = { server_name: `سيرفر ${parsedStreams.length + 1}`, url: "", agent: agentData, drm: null, headers: {} };
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
                    } catch (err) {}
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

// 3. مسار استخراج الرابط النهائي
app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url;
        const channelId = req.query.id_live || req.body.id_live;
        const type = req.query.type || req.body.type || "redirect";
        if (!targetUrl) {
            return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url) المراد استخراجه" });
        }
        let result;
        if (type === "double_redirect") {
            result = await resolveDoubleRedirect(channelId, targetUrl);
        } else {
            result = await resolveRedirectServer(channelId, targetUrl);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// قائمة الأقسام
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
    {"id_topic":"971","name_topic":"الإمارات","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ae.png","code":"ae"},
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

app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("🚀 Server is running on port " + PORT);
});
