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

// ==========================================
// 🆕 القيم الافتراضية للـ agent والـ headers
// ==========================================
const DEFAULT_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
};

// ==========================================
// 🆕 دالة: إنشاء هيكل موحد للسيرفر
// ==========================================
function createServerObject(serverName, url, agent, headers = {}, drm = null, mediatype = null) {
    // إذا ما في agent، استخدم الافتراضي
    const finalAgent = agent || DEFAULT_AGENT;
    
    // إذا ما في headers، استخدم الافتراضي
    const finalHeaders = headers && Object.keys(headers).length > 0 
        ? headers 
        : { ...DEFAULT_HEADERS };
    
    // إذا headers موجودة بس ما فيها User-Agent، أضيف User-Agent
    if (!finalHeaders["User-Agent"] && !finalHeaders["user-agent"]) {
        finalHeaders["User-Agent"] = finalAgent;
    }
    
    return {
        server_name: serverName,
        url: url || "",
        agent: finalAgent,
        drm: drm || null,
        headers: finalHeaders,
        mediatype: mediatype || null
    };
}

// ==========================================
// دالة: استخراج البيانات من JSON string
// ==========================================
function extractFromJSON(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        return {
            url: obj.url || "",
            agent: obj.agent || null,
            headers: obj.headers || {},
            drm: obj.drm || null,
            mediatype: obj.mediatype || null,
            iframe: obj.iframe || null,
            acceptSSL: obj.acceptSSL || null
        };
    } catch (e) {
        return {
            url: jsonStr,
            agent: null,
            headers: {},
            drm: null,
            mediatype: null,
            iframe: null,
            acceptSSL: null
        };
    }
}

// ==========================================
// دالة: زيارة رابط وسيط واستخراج m3u8/mpd
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
            validateStatus: function (status) {
                return status < 500;
            }
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
            const sourceMatch = html.match(/source\s+src=["']([^"']+)["']/i);
            if (sourceMatch) streamUrl = sourceMatch[1];
        }
        
        if (!streamUrl) {
            const iframeMatch = html.match(/iframe\s+src=["']([^"']+)["']/i);
            if (iframeMatch) streamUrl = iframeMatch[1];
        }

        if (!streamUrl) {
            const base64Match = html.match(/atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/);
            if (base64Match) {
                try {
                    const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                    if (decoded.includes(".m3u8") || decoded.includes(".mpd") || decoded.startsWith("http")) {
                        streamUrl = decoded;
                    }
                } catch (err) {}
            }
        }

        if (streamUrl) {
            return {
                success: true,
                url: streamUrl,
                mediatype: streamUrl.includes(".mpd") ? "dash" : "hls"
            };
        }

        return { success: false };

    } catch (error) {
        return { success: false, error: error.message };
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
// 🆕 دالة: حل رابط redirect وإرجاع البيانات كاملة
// ==========================================
async function resolveRedirectUrl(channelId, fakeUrl) {
    let currentUrl = fakeUrl;
    let currentAgent = "redirect";
    let encryptedRawData = "";
    let maxSteps = 5;
    
    // نحتفظ بالـ agent والـ headers اللي بنلاقيهم من السيرفر
    let foundAgent = null;
    let foundHeaders = {};
    let foundDrm = null;

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
        
        if (newAgent === "advanced" || newAgent === "stop") {
            const parsed = extractFromJSON(data.url);
            
            // 🎯 نجمع agent و headers من الرد
            if (parsed.agent && !foundAgent) foundAgent = parsed.agent;
            if (parsed.headers && Object.keys(parsed.headers).length > 0) {
                foundHeaders = { ...foundHeaders, ...parsed.headers };
            }
            if (parsed.drm && !foundDrm) foundDrm = parsed.drm;
            
            // رابط LS.V2 وهمي ➔ نجرب raw_data
            if (parsed.url && parsed.url.includes(".LS.V2")) {
                if (result.encrypted_response && !encryptedRawData) {
                    encryptedRawData = result.encrypted_response.trim();
                    currentUrl = data.url;
                    currentAgent = "double_redirect";
                    continue;
                }
                return null;
            }
            
            // رابط مباشر m3u8/mpd ➔ نرجع مع البيانات اللي جمعناها
            if (parsed.url && (parsed.url.includes(".m3u8") || parsed.url.includes(".mpd"))) {
                return {
                    url: parsed.url,
                    agent: foundAgent || parsed.agent,
                    headers: Object.keys(foundHeaders).length > 0 ? foundHeaders : parsed.headers,
                    drm: foundDrm || parsed.drm,
                    mediatype: parsed.url.includes(".mpd") ? "dash" : "hls"
                };
            }
            
            // رابط وسيط http ➔ زوره
            if (parsed.url && parsed.url.startsWith("http")) {
                const fetchResult = await fetchIntermediateUrl(
                    parsed.url, 
                    Object.keys(foundHeaders).length > 0 ? foundHeaders : parsed.headers,
                    foundAgent || parsed.agent
                );
                
                if (fetchResult.success) {
                    return {
                        url: fetchResult.url,
                        agent: foundAgent || parsed.agent,
                        headers: Object.keys(foundHeaders).length > 0 ? foundHeaders : parsed.headers,
                        drm: foundDrm || parsed.drm,
                        mediatype: fetchResult.mediatype
                    };
                }
                
                // iframe
                if (parsed.iframe && parsed.iframe.startsWith("http")) {
                    const iframeResult = await fetchIntermediateUrl(
                        parsed.iframe,
                        Object.keys(foundHeaders).length > 0 ? foundHeaders : parsed.headers,
                        foundAgent || parsed.agent
                    );
                    if (iframeResult.success) {
                        return {
                            url: iframeResult.url,
                            agent: foundAgent || parsed.agent,
                            headers: Object.keys(foundHeaders).length > 0 ? foundHeaders : parsed.headers,
                            drm: foundDrm || parsed.drm,
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
                
                return null;
            }
            
            if (result.encrypted_response && !encryptedRawData) {
                encryptedRawData = result.encrypted_response.trim();
                currentUrl = data.url;
                currentAgent = "double_redirect";
                continue;
            }
            
            return null;
        }
        
        if (newAgent === "redirect" || newAgent === "double_redirect") {
            currentUrl = data.url;
            currentAgent = newAgent;
            encryptedRawData = "";
            continue;
        }
        
        return null;
    }

    return null;
}

// ==========================================
// 🆕 دالة: معالجة سيرفر واحد وإرجاع هيكل موحد
// ==========================================
async function processServer(id_live, serverName, urlData, agentData) {
    // إذا urlData مش فارغ وهو JSON
    if (urlData && urlData.startsWith("{")) {
        const parsed = extractFromJSON(urlData);
        const effectiveAgent = parsed.agent || agentData;
        const isRedirect = effectiveAgent === "redirect";
        
        if (isRedirect) {
            console.log(`🔄 حل ${serverName}...`);
            const resolved = await resolveRedirectUrl(id_live, parsed.url || urlData);
            
            if (resolved && resolved.url) {
                // ✅ تم الحل - نرجع الهيكل مع البيانات المستخرجة
                return createServerObject(
                    serverName + " ✅",
                    resolved.url,
                    resolved.agent || effectiveAgent,
                    resolved.headers || parsed.headers,
                    resolved.drm || parsed.drm,
                    resolved.mediatype
                );
            } else {
                // ❌ فشل - نرجع الرابط الأصلي
                return createServerObject(
                    serverName + " ❌",
                    parsed.url || "",
                    effectiveAgent,
                    parsed.headers,
                    parsed.drm,
                    parsed.mediatype
                );
            }
        } else {
            // مش redirect - نرجع كما هو
            return createServerObject(
                serverName,
                parsed.url,
                effectiveAgent,
                parsed.headers,
                parsed.drm,
                parsed.mediatype
            );
        }
    }
    
    // إذا urlData مش JSON
    const isRedirect = agentData === "redirect";
    
    if (isRedirect) {
        console.log(`🔄 حل ${serverName}...`);
        const resolved = await resolveRedirectUrl(id_live, urlData);
        
        if (resolved && resolved.url) {
            return createServerObject(
                serverName + " ✅",
                resolved.url,
                resolved.agent,
                resolved.headers,
                resolved.drm,
                resolved.mediatype
            );
        } else {
            return createServerObject(
                serverName + " ❌",
                "",
                agentData,
                {},
                null,
                null
            );
        }
    }
    
    // مش redirect ولا JSON - نرجع كما هو
    return createServerObject(
        serverName,
        urlData,
        agentData,
        {},
        null,
        null
    );
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

// ==========================================
// 2. 🆕 مسار /stream - هيكل موحد مع Agent و Headers
// ==========================================
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });
        }

        console.log(`📺 جلب سيرفرات: ${id_live}`);

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
        
        // 🔹 السيرفر الأساسي
        const mainUrl = liveData.url || "";
        const mainAgent = liveData.agent || "";
        
        if (mainUrl && mainUrl !== "empty") {
            const server = await processServer(id_live, "السيرفر الأساسي", mainUrl, mainAgent);
            parsedStreams.push(server);
        }

        // 🔹 السيرفرات الاحتياطية
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

                const serverName = `سيرفر ${parsedStreams.length + 1}`;
                const server = await processServer(id_live, serverName, linkData, agentData);
                parsedStreams.push(server);
            }
        }

        const result = {
            id_live: liveData.id_live || id_live,
            name: liveData.name || "",
            img_url: liveData.img_url || "",
            streams: parsedStreams
        };

        console.log(`✅ ${parsedStreams.length} سيرفر`);
        res.json(result);

    } catch (error) {
        console.error("❌ خطأ:", error.message);
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 3. مسار /resolve و /extract
// ==========================================
app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url;
        const channelId = req.query.id_live || req.body.id_live || "test";
        
        if (!targetUrl) {
            return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        }

        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json(result ? { success: true, ...result } : { error: true, message: "فشل استخراج الرابط" });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.get("/extract", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "test";
        
        if (!targetUrl) {
            return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        }

        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json({ success: result ? true : false, result: result });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// قائمة الأقسام
// ==========================================
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
