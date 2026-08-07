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

        const html = response.data;
        
        // 🔍 البحث عن روابط m3u8/mpd في الـ HTML
        let streamUrl = null;
        
        // البحث عن m3u8
        const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) streamUrl = m3u8Match[1];
        
        // البحث عن mpd
        if (!streamUrl) {
            const mpdMatch = html.match(/(https?:\/\/[^\s"'<>]+\.mpd[^\s"'<>]*)/i);
            if (mpdMatch) streamUrl = mpdMatch[1];
        }
        
        // البحث في source src
        if (!streamUrl) {
            const sourceMatch = html.match(/source\s+src=["']([^"']+)["']/i);
            if (sourceMatch) streamUrl = sourceMatch[1];
        }
        
        // البحث في iframe src
        if (!streamUrl) {
            const iframeMatch = html.match(/iframe\s+src=["']([^"']+)["']/i);
            if (iframeMatch) streamUrl = iframeMatch[1];
        }

        return {
            success: streamUrl ? true : false,
            stream_url: streamUrl,
            html_snippet: html.substring(0, 500) // أول 500 حرف للتشخيص
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
// 🆕 دالة: إرسال طلب للسيرفر
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
            
            // 🔹 إذا stream_url فاضي والرابط وسيط (زي daddy4.php) ➔ زوره مباشرة
            if ((!parsed.stream_url || parsed.stream_url === "") && parsed.headers) {
                console.log("⚠️ stream_url فاضي، نجرب زيارة الرابط مباشرة...");
                
                // استخرج الرابط الوسيط من currentUrl أو من الـ data.url الأصلي
                let intermediateUrl = currentUrl;
                
                // إذا currentUrl هو JSON، فك الرابط منه
                if (currentUrl.startsWith("{")) {
                    try {
                        const temp = JSON.parse(currentUrl);
                        intermediateUrl = temp.url || currentUrl;
                    } catch (e) {}
                }
                
                // إذا مش رابط http، جيب الرابط من data.url
                if (!intermediateUrl.startsWith("http")) {
                    intermediateUrl = parsed.iframe || parsed.stream_url || currentUrl;
                }
                
                if (intermediateUrl.startsWith("http")) {
                    const fetchResult = await fetchIntermediateUrl(
                        intermediateUrl,
                        parsed.headers,
                        parsed.agent
                    );
                    
                    steps.push({
                        step: "fetch_intermediate",
                        url_visited: intermediateUrl,
                        result: fetchResult
                    });
                    
                    if (fetchResult.success && fetchResult.stream_url) {
                        finalResult = {
                            stream_url: fetchResult.stream_url,
                            agent: parsed.agent,
                            headers: parsed.headers,
                            mediatype: parsed.mediatype || "hls"
                        };
                        break;
                    }
                }
            }
            
            // إذا stream_url موجود ➔ خلاص
            if (parsed.stream_url && parsed.stream_url !== "") {
                finalResult = parsed;
                break;
            }
            
            // إذا raw_data موجود ➔ نجرب نرسله
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
        success: finalResult && finalResult.stream_url && finalResult.stream_url !== "" ? true : false,
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
            res.json({ success: false, error: true, message: "لم يتم العثور على رابط البث", steps: result.steps });
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
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3", "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604", "device_api": "28", "version_name": "187", "language": "ar", "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct", "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}", "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "id": channelId, "url": realUrl, "agent": "redirect", "raw_data": ""
        };
        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://redirect.1spbgmu.com/redirect/getLiveByDoubleRedirect", encryptedBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "redirect.1spbgmu.com", "Connection": "Keep-Alive", "Accept-Encoding": "gzip" },
            timeout: 15000, responseType: "arraybuffer"
        });
        const decryptedText = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const jsonResponse = JSON.parse(decryptedText);
        let result = { stream_url: null, headers: {}, agent: "ExoPlayer" };
        if (jsonResponse.data && jsonResponse.data.url) {
            try { const innerData = JSON.parse(jsonResponse.data.url); result.stream_url = innerData.url || null; if (innerData.headers) result.headers = innerData.headers; if (innerData.agent) result.agent = innerData.agent; }
            catch (e) { result.stream_url = jsonResponse.data.url; }
        }
        return result;
    } catch (error) { return { error: true, message: error.message }; }
}

async function resolveDoubleRedirect(channelId, serverUrl) {
    try {
        let urlData = serverUrl;
        if (!serverUrl.startsWith("{")) { urlData = convertFakeUrlToRealUrl(serverUrl, channelId); }
        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3", "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604", "device_api": "28", "version_name": "187", "language": "ar", "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct", "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}", "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "id": channelId, "url": urlData, "agent": "double_redirect", "raw_data": ""
        };
        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://redirect.1spbgmu.com/redirect/getLiveByDoubleRedirect", encryptedBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "redirect.1spbgmu.com", "Connection": "Keep-Alive", "Accept-Encoding": "gzip" },
            timeout: 15000, responseType: "arraybuffer"
        });
        const decryptedText = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const jsonResponse = JSON.parse(decryptedText);
        let result = { stream_url: null, headers: {}, agent: "ExoPlayer" };
        if (jsonResponse.data && jsonResponse.data.url) {
            try { const innerData = JSON.parse(jsonResponse.data.url); result.stream_url = innerData.url || null; if (innerData.headers) result.headers = innerData.headers; if (innerData.agent) result.agent = innerData.agent; }
            catch (e) { result.stream_url = jsonResponse.data.url; }
        }
        return result;
    } catch (error) { return { error: true, message: error.message }; }
}

app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport";
        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3", "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604", "device_api": "28", "version_name": "187", "language": "ar", "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct", "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}", "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv", "topic": topic
        };
        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic", encryptedBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
            timeout: 30000
        });
        const jsonResponse = JSON.parse(decryptAES(response.data));
        let rawChannels = Array.isArray(jsonResponse) ? jsonResponse : (jsonResponse.channels || jsonResponse.live || []);
        const formattedChannels = rawChannels.map(ch => ({ type: ch.type || "tv", id_live: ch.id_live || "", name: ch.name || "", url: ch.url || "", agent: ch.agent || "", backup: ch.backup || "", img_url: ch.img_url || "", id_topic: ch.id_topic || topic }));
        res.json(formattedChannels);
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});

app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const resolveAll = req.query.resolve === "true";
        if (!id_live) return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });
        const postData = {
            "user_id": "_82668_1785761367217_notloggedin.com_dramalive3", "device_id": "e603540e-ed93-47a3-bec6-a15f7f056604", "device_api": "28", "version_name": "187", "language": "ar", "timezone": "Europe/Istanbul", "device_type": "phone",
            "KEY_ACTIVATED_TYPE": "232425", "store": "direct", "isStoreVersion": false, "isPremium": false, "isCoupon_active": false, "hideAds": false,
            "appCount": "{\"adsFailed\":73,\"adsLoaded\":56,\"adsShowed\":17,\"runCount\":8}", "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv", "id_live": id_live, "id": id_live, "live_id": id_live, "channel_id": id_live
        };
        const encryptedBody = encryptAES(JSON.stringify(postData));
        const response = await axios.post("http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById", encryptedBody, {
            headers: { "Content-Type": "text/plain", "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)", "Host": "live.1spbgmu.com", "Connection": "Keep-Alive" },
            timeout: 30000, responseType: "arraybuffer"
        });
        const decryptedResponse = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const rawJson = JSON.parse(decryptedResponse);
        const liveData = rawJson.live || {};
        let parsedStreams = [];
        const mainUrl = liveData.url || "";
        const mainAgent = liveData.agent || "";
        if (mainUrl && mainUrl !== "empty") {
            let streamObj = { server_name: "السيرفر الأساسي", url: mainUrl, agent: mainAgent || "ExoPlayer", drm: null };
            if (resolveAll && mainAgent === "redirect") {
                try { const resolved = await resolveRedirectServer(id_live, mainUrl); if (resolved.stream_url) { streamObj.url = resolved.stream_url; streamObj.agent = resolved.agent || streamObj.agent; streamObj.headers = resolved.headers; streamObj.server_name += " ✅"; } } catch (err) {}
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
                    try { const jsonObj = JSON.parse(linkData); streamObj.url = jsonObj.url || ""; if (jsonObj.agent) streamObj.agent = jsonObj.agent; if (jsonObj.headers) { streamObj.headers = jsonObj.headers; if (jsonObj.headers["User-Agent"]) streamObj.agent = jsonObj.headers["User-Agent"]; } if (jsonObj.drm) streamObj.drm = jsonObj.drm; } catch (e) { streamObj.url = linkData; }
                } else { streamObj.url = linkData; }
                if (resolveAll && streamObj.url) {
                    try { let resolved = null; if (agentData === "redirect") { resolved = await resolveRedirectServer(id_live, streamObj.url); } else if (agentData === "double_redirect") { resolved = await resolveDoubleRedirect(id_live, linkData); } if (resolved && resolved.stream_url) { streamObj.url = resolved.stream_url; streamObj.agent = resolved.agent || streamObj.agent; streamObj.headers = resolved.headers || streamObj.headers; streamObj.server_name += " ✅"; } } catch (err) {}
                }
                if (streamObj.url) { parsedStreams.push(streamObj); }
            }
        }
        res.json({ id_live: liveData.id_live || id_live, name: liveData.name || "", img_url: liveData.img_url || "", streams: parsedStreams });
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});

app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url;
        const channelId = req.query.id_live || req.body.id_live;
        const type = req.query.type || req.body.type || "redirect";
        if (!targetUrl) { return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url) المراد استخراجه" }); }
        let result;
        if (type === "double_redirect") { result = await resolveDoubleRedirect(channelId, targetUrl); }
        else { result = await resolveRedirectServer(channelId, targetUrl); }
        res.json(result);
    } catch (error) { res.status(500).json({ error: true, message: error.message }); }
});

const allTopics = [
    {"id_topic":"hot_now","name_topic":"الأكثر مشاهدة","img_url_topic":"http://logo.twoapistack.work/img/topics/hot_now.png","code":""},
    {"id_topic":"alwan","name_topic":"الوان","img_url_topic":"http://logo.twoapistack.work/img/topics/alwan.jpg","code":""},
    {"id_topic":"shahid","name_topic":"شاهد","img_url_topic":"http://logo.twoapistack.work/img/topics/shahid.jpg","code":""},
    {"id_topic":"arabic_sport","name_topic":"رياضة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_basketball_red.png","code":""},
    {"id_topic":"bein_sport","name_topic":"بي ان سبورت","img_url_topic":"http://logo.twoapistack.work/img/topics/bein_sport.png","code":""}
];

app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("🚀 Server is running on port " + PORT);
});
