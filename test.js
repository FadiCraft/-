const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const NodeCache = require("node-cache");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// نظام الكاش المتكامل
// ==========================================
const cache = new NodeCache({
    stdTTL: 600, // الوقت الافتراضي: 10 دقائق
    checkperiod: 120, // فحص العناصر المنتهية كل دقيقتين
    useClones: false, // تحسين الأداء
    maxKeys: 1000 // الحد الأقصى للعناصر
});

// إعدادات الكاش المختلفة
const CACHE_CONFIG = {
    channels: { ttl: 300, enabled: true }, // 5 دقائق
    streams: { ttl: 600, enabled: true }, // 10 دقائق
    matches: { ttl: 300, enabled: true }, // 5 دقائق
    redirect: { ttl: 900, enabled: true }, // 15 دقيقة
    resolve: { ttl: 900, enabled: true }, // 15 دقيقة
    topics: { ttl: 3600, enabled: true }, // ساعة واحدة
    live_id: { ttl: 600, enabled: true }, // 10 دقائق
    last: { ttl: 600, enabled: true } // 10 دقائق
};

// دالة مساعدة للحصول على بيانات من الكاش
function getFromCache(key) {
    try {
        const value = cache.get(key);
        if (value !== undefined) {
            console.log(`✅ [CACHE] تم استرجاع البيانات من الكاش: ${key}`);
            return { hit: true, data: value };
        }
        return { hit: false, data: null };
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في قراءة الكاش:`, error.message);
        return { hit: false, data: null };
    }
}

// دالة مساعدة لحفظ البيانات في الكاش
function setToCache(key, data, ttl = 600) {
    try {
        const success = cache.set(key, data, ttl);
        if (success) {
            console.log(`💾 [CACHE] تم حفظ البيانات في الكاش: ${key} (TTL: ${ttl}s)`);
        }
        return success;
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في حفظ الكاش:`, error.message);
        return false;
    }
}

// دالة لحذف عنصر من الكاش
function deleteFromCache(key) {
    try {
        const deleted = cache.del(key);
        if (deleted > 0) {
            console.log(`🗑️ [CACHE] تم حذف البيانات من الكاش: ${key}`);
        }
        return deleted;
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في حذف الكاش:`, error.message);
        return 0;
    }
}

// دالة لمسح الكاش بالكامل
function clearAllCache() {
    try {
        const keys = cache.keys();
        const cleared = cache.flushAll();
        console.log(`🧹 [CACHE] تم مسح الكاش بالكامل (${keys.length} عنصر)`);
        return cleared;
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في مسح الكاش:`, error.message);
        return false;
    }
}

// دالة لمسح كاش محدد حسب البادئة
function clearCacheByPrefix(prefix) {
    try {
        const keys = cache.keys().filter(key => key.startsWith(prefix));
        let count = 0;
        keys.forEach(key => {
            if (cache.del(key) > 0) count++;
        });
        console.log(`🧹 [CACHE] تم مسح ${count} عنصر بالبادئة: ${prefix}`);
        return count;
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في مسح الكاش:`, error.message);
        return 0;
    }
}

// دالة للحصول على إحصائيات الكاش
function getCacheStats() {
    try {
        const stats = cache.getStats();
        const keys = cache.keys();
        const ttlInfo = {};
        
        keys.forEach(key => {
            const ttl = cache.getTtl(key);
            if (ttl) {
                ttlInfo[key] = {
                    expiresAt: new Date(ttl).toISOString(),
                    remainingSeconds: Math.floor((ttl - Date.now()) / 1000)
                };
            }
        });
        
        return {
            ...stats,
            totalKeys: keys.length,
            keys: keys,
            ttlInfo: ttlInfo
        };
    } catch (error) {
        console.error(`❌ [CACHE] خطأ في جلب إحصائيات الكاش:`, error.message);
        return { error: error.message };
    }
}

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
        
        const streamUrl = obj.url || "";
        const agent = obj.agent || fallbackAgent || DEFAULT_AGENT;
        const mediatype = obj.mediatype || (streamUrl.includes(".mpd") ? "dash" : streamUrl.includes(".m3u8") ? "hls" : null);
        
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
    // محاولة جلب من الكاش أولاً
    const cacheKey = `intermediate:${url}`;
    const cacheResult = getFromCache(cacheKey);
    if (cacheResult.hit) {
        return cacheResult.data;
    }
    
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

        const result = streamUrl ? {
            success: true,
            url: streamUrl,
            agent: agent || DEFAULT_AGENT,
            headers: headers || {},
            mediatype: streamUrl.includes(".mpd") ? "dash" : "hls"
        } : { success: false };
        
        // حفظ في الكاش
        if (result.success) {
            setToCache(cacheKey, result, 300); // 5 دقائق
        }
        
        return result;

    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ==========================================
// دالة: إرسال طلب للسيرفر
// ==========================================
async function sendRequest(channelId, urlData, agent, encryptedRawData = "", endpoint = "getLiveByRedirect") {
    // إنشاء مفتاح كاش فريد للطلب
    const cacheKey = `redirect:${endpoint}:${channelId}:${urlData.substring(0, 100)}`;
    
    // محاولة جلب من الكاش
    const cacheResult = getFromCache(cacheKey);
    if (cacheResult.hit) {
        return cacheResult.data;
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

    const result = {
        encrypted_response: encryptedResponse,
        decrypted_response: jsonResponse
    };
    
    // حفظ في الكاش لمدة 15 دقيقة
    setToCache(cacheKey, result, CACHE_CONFIG.redirect.ttl);
    
    return result;
}

// ==========================================
// 🆕 دالة: حل رابط redirect - ترجع البيانات كاملة من آخر رد
// ==========================================
async function resolveRedirectUrl(channelId, fakeUrl) {
    // محاولة جلب من الكاش
    const cacheKey = `resolve:${channelId}:${fakeUrl}`;
    const cacheResult = getFromCache(cacheKey);
    if (cacheResult.hit) {
        return cacheResult.data;
    }
    
    let currentUrl = fakeUrl;
    let currentAgent = "redirect";
    let encryptedRawData = "";
    let maxSteps = 5;
    
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
        
        const parsed = parseDataUrl(data.url, null);
        lastParsedData = parsed;
        
        if (newAgent === "advanced" || newAgent === "stop") {
            
            if (parsed.url && parsed.url.includes(".LS.V2")) {
                if (result.encrypted_response && !encryptedRawData) {
                    encryptedRawData = result.encrypted_response.trim();
                    currentUrl = data.url;
                    currentAgent = "double_redirect";
                    continue;
                }
                break;
            }
            
            if (parsed.url && (parsed.url.includes(".m3u8") || parsed.url.includes(".mpd"))) {
                const finalResult = {
                    url: parsed.url,
                    agent: parsed.agent,
                    headers: parsed.headers,
                    drm: parsed.drm,
                    mediatype: parsed.mediatype
                };
                setToCache(cacheKey, finalResult, CACHE_CONFIG.resolve.ttl);
                return finalResult;
            }
            
            if (parsed.url && parsed.url.startsWith("http")) {
                const fetchResult = await fetchIntermediateUrl(parsed.url, parsed.headers, parsed.agent);
                
                if (fetchResult.success) {
                    const finalResult = {
                        url: fetchResult.url,
                        agent: parsed.agent,
                        headers: parsed.headers,
                        drm: parsed.drm,
                        mediatype: fetchResult.mediatype
                    };
                    setToCache(cacheKey, finalResult, CACHE_CONFIG.resolve.ttl);
                    return finalResult;
                }
                
                if (parsed.iframe && parsed.iframe.startsWith("http")) {
                    const iframeResult = await fetchIntermediateUrl(parsed.iframe, parsed.headers, parsed.agent);
                    if (iframeResult.success) {
                        const finalResult = {
                            url: iframeResult.url,
                            agent: parsed.agent,
                            headers: parsed.headers,
                            drm: parsed.drm,
                            mediatype: iframeResult.mediatype
                        };
                        setToCache(cacheKey, finalResult, CACHE_CONFIG.resolve.ttl);
                        return finalResult;
                    }
                }
                
                if (result.encrypted_response && !encryptedRawData) {
                    encryptedRawData = result.encrypted_response.trim();
                    currentUrl = data.url;
                    currentAgent = "double_redirect";
                    continue;
                }
                
                break;
            }
            
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

    if (lastParsedData && lastParsedData.url && lastParsedData.url.startsWith("http")) {
        const finalResult = {
            url: lastParsedData.url,
            agent: lastParsedData.agent,
            headers: lastParsedData.headers,
            drm: lastParsedData.drm,
            mediatype: lastParsedData.mediatype
        };
        setToCache(cacheKey, finalResult, CACHE_CONFIG.resolve.ttl);
        return finalResult;
    }

    return null;
}

// ==========================================
// 🆕 دالة: معالجة سيرفر واحد
// ==========================================
async function processServer(id_live, serverName, urlData, agentData) {
    
    if (urlData && urlData.startsWith("{")) {
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
                return createServerObject(
                    serverName + " ",
                    resolved.url,
                    resolved.agent,
                    resolved.headers,
                    resolved.drm || parsed.drm,
                    resolved.mediatype
                );
            } else if (resolved && resolved.url) {
                return createServerObject(
                    serverName + " ⚠️",
                    resolved.url,
                    resolved.agent,
                    resolved.headers,
                    resolved.drm || parsed.drm,
                    resolved.mediatype
                );
            } else {
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
// 1. مسار جلب القنوات (مع الكاش)
// ==========================================
app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport";
        
        // إنشاء مفتاح كاش
        const cacheKey = `channels:${topic}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.channels.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                return res.json(cacheResult.data);
            }
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
        
        // حفظ في الكاش
        if (CACHE_CONFIG.channels.enabled) {
            setToCache(cacheKey, formattedChannels, CACHE_CONFIG.channels.ttl);
        }
        
        res.json(formattedChannels);
    } catch (error) { 
        res.status(500).json({ error: true, message: error.message }); 
    }
});

// ==========================================
// مسار /stream (مع الكاش)
// ==========================================
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });
        }

        // إنشاء مفتاح كاش
        const cacheKey = `stream:${id_live}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.streams.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                console.log(`📺 [CACHE] استرجاع سيرفرات القناة ${id_live} من الكاش`);
                return res.json(cacheResult.data);
            }
        }

        console.log(`📺 جلب ومعالجة كافة سيرفرات القناة: ${id_live}`);

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

        let allServerResults = [];

        for (const item of rawStreams) {
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

                    allServerResults.push(parsedRedirect);
                } catch (err) {
                    console.error(`❌ خطأ في فك تشفير سيرفر redirect:`, err.message);
                }
            } else {
                let innerUrlString = item.url;
                if (!innerUrlString.startsWith("{")) {
                    innerUrlString = JSON.stringify({
                        "url": item.url,
                        "agent": item.agent || DEFAULT_USER_AGENT,
                        "acceptSSL": "1",
                        "headers": {
                            "User-Agent": item.agent || DEFAULT_USER_AGENT
                        }
                    });
                }

                allServerResults.push({
                    "result": 0,
                    "message": {
                        "en": "operation succeeded",
                        "ar": "تمت العملية بنجاح"
                    },
                    "data": {
                        "url": innerUrlString,
                        "agent": "advanced"
                    }
                });
            }
        }

        // حفظ في الكاش
        if (CACHE_CONFIG.streams.enabled) {
            setToCache(cacheKey, allServerResults, CACHE_CONFIG.streams.ttl);
        }

        res.json(allServerResults);

    } catch (error) { 
        console.error(`❌ خطأ في مسار /stream:`, error.message);
        res.status(500).json({ error: true, message: error.message }); 
    }
});

// ==========================================
// 1. مسار POST: استخراج رد مفكوك التشفير (مع الكاش)
// ==========================================
app.post("/get-redirect-data", async (req, res) => {
    try {
        const id_live = req.body.id_live;
        let url = req.body.url;
        const agent = req.body.agent || "redirect";

        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في الـ Body" });
        }

        // إنشاء مفتاح كاش
        const cacheKey = `redirect-data:${id_live}:${url || 'auto'}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.redirect.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                return res.json(cacheResult.data);
            }
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

        let result = await sendRequest(id_live, url, agent, "", "getLiveByRedirect");
        let responseData = result.decrypted_response;
        let returnedUrl = responseData?.data?.url || "";

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

        // حفظ في الكاش
        if (CACHE_CONFIG.redirect.enabled) {
            setToCache(cacheKey, result.decrypted_response, CACHE_CONFIG.redirect.ttl);
        }

        res.json(result.decrypted_response);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 2. مسار GET: جلب الرد مفكوك التشفير (مع الكاش)
// ==========================================
app.get("/get-redirect-data", async (req, res) => {
    try {
        const id_live = req.query.id_live;

        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في الرابط" });
        }

        // إنشاء مفتاح كاش
        const cacheKey = `redirect-data:${id_live}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.redirect.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                console.log(`🔍 [CACHE] استرجاع بيانات redirect من الكاش: ${id_live}`);
                return res.json(cacheResult.data);
            }
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

        let result = await sendRequest(id_live, url, "redirect", "", "getLiveByRedirect");
        let responseData = result.decrypted_response;
        let returnedUrl = responseData?.data?.url || "";

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

        // حفظ في الكاش
        if (CACHE_CONFIG.redirect.enabled) {
            setToCache(cacheKey, result.decrypted_response, CACHE_CONFIG.redirect.ttl);
        }

        res.json(result.decrypted_response);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 🆕 المسار الذكي المدمج (مع الكاش)
// ==========================================
app.get("/live_id/:id", async (req, res) => {
    try {
        const id_live = req.params.id;
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id في الرابط" });
        }

        // إنشاء مفتاح كاش
        const cacheKey = `live_id:${id_live}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.live_id.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                console.log(`🤖 [CACHE] استرجاع بيانات القناة ${id_live} من الكاش`);
                return res.json(cacheResult.data);
            }
        }

        console.log(`🤖 [المسار الذكي] جاري فحص القناة: ${id_live}`);

        const localBaseUrl = `http://localhost:${PORT}`;

        try {
            const redirectResponse = await axios.get(`${localBaseUrl}/get-redirect-data?id_live=${id_live}`);
            const redirectData = redirectResponse.data;
            const returnedUrl = redirectData?.data?.url || "";

            if (returnedUrl && returnedUrl !== "1" && returnedUrl !== "empty") {
                console.log(`✅ [المسار الذكي] تم الحصول على رابط مباشر للقناة ${id_live}`);
                
                // حفظ في الكاش
                if (CACHE_CONFIG.live_id.enabled) {
                    setToCache(cacheKey, redirectData, CACHE_CONFIG.live_id.ttl);
                }
                
                return res.json(redirectData);
            }
        } catch (err) {
            console.log(`⚠️ فشل أو خطأ في مسار Redirect، سيتم الانتقال لمسار Stream...`);
        }

        console.log(`🔄 [المسار الذكي] النتيجة غير صالحة (1)، جاري استدعاء مسار السيرفرات الكاملة...`);
        const streamResponse = await axios.get(`${localBaseUrl}/stream?id_live=${id_live}`);
        const streamData = streamResponse.data;

        let hasValidStreams = false;
        if (streamData && Array.isArray(streamData.streams)) {
            hasValidStreams = streamData.streams.some(server => server.url && server.url.trim() !== "");
        }

        if (hasValidStreams) {
            console.log(`✅ [المسار الذكي] تم العثور على سيرفرات تعمل للقناة ${id_live}`);
            
            // حفظ في الكاش
            if (CACHE_CONFIG.live_id.enabled) {
                setToCache(cacheKey, streamData, CACHE_CONFIG.live_id.ttl);
            }
            
            return res.json(streamData);
        }

        console.log(`⚠️ تحذير: جميع السيرفرات فارغة! جاري التحويل إلى مسار البديل /last/ لقناة: ${id_live}`);
        
        try {
            const lastResponse = await axios.get(`${localBaseUrl}/last/${id_live}`);
            
            // حفظ في الكاش
            if (CACHE_CONFIG.live_id.enabled) {
                setToCache(cacheKey, lastResponse.data, CACHE_CONFIG.live_id.ttl);
            }
            
            return res.json(lastResponse.data);
        } catch (lastErr) {
            console.log(`❌ فشل مسار /last: ${lastErr.message}`);
            return res.json(streamData);
        }

    } catch (error) {
        res.status(500).json({ error: true, message: "حدث خطأ أثناء معالجة المسار الذكي: " + error.message });
    }
});

// ==========================================
// مسار مشترك: /last/ (مع الكاش)
// ==========================================
app.get("/last/:id_live", async (req, res) => {
    try {
        const id_live = req.params.id_live;
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live في المسار" });
        }

        // إنشاء مفتاح كاش
        const cacheKey = `last:${id_live}`;
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.last.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                console.log(`🚀 [CACHE] استرجاع بيانات المسار المشترك من الكاش: ${id_live}`);
                return res.json(cacheResult.data);
            }
        }

        console.log(`🚀 بدء معالجة المسار المشترك لقناة: ${id_live}`);

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

        const redirectResult = await sendRequest(id_live, url, "redirect", "", "getLiveByRedirect");
        const redirectData = redirectResult.decrypted_response;

        let urlVal = "";
        if (redirectData && redirectData.data && redirectData.data.url) {
            urlVal = redirectData.data.url.trim();
        }

        let finalResult;

        if (urlVal !== "1" && urlVal !== "" && urlVal !== "empty") {
            finalResult = redirectData;
        } else {
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

            finalResult = {
                id_live: liveData.id_live || id_live,
                name: liveData.name || "",
                img_url: liveData.img_url || "",
                streams: parsedStreams
            };
        }

        // حفظ في الكاش
        if (CACHE_CONFIG.last.enabled) {
            setToCache(cacheKey, finalResult, CACHE_CONFIG.last.ttl);
        }

        res.json(finalResult);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 4. مسار جلب المباريات (مع الكاش)
// ==========================================
app.get("/mach", async (req, res) => {
    try {
        // إنشاء مفتاح كاش
        const cacheKey = "matches:all";
        
        // محاولة جلب من الكاش
        if (CACHE_CONFIG.matches.enabled) {
            const cacheResult = getFromCache(cacheKey);
            if (cacheResult.hit) {
                console.log(`⚽ [CACHE] استرجاع بيانات المباريات من الكاش`);
                return res.json(cacheResult.data);
            }
        }
        
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

        const formattedMatches = rawMatches.map(match => {
            let matchTime = "";
            let matchStatus = "لم تبدأ";
            let dateVal = match.date || "";
            
            if (dateVal.includes("انتهت")) {
                matchStatus = "انتهت";
                matchTime = "انتهت";
            } else {
                const timeMatch = dateVal.match(/\d{2}:\d{2}/);
                if (timeMatch) matchTime = timeMatch[0];
                else matchTime = dateVal;
            }

            let finalScore = "";
            if (match.firstTeamScore && match.firstTeamScore !== "-") {
                finalScore = match.firstTeamScore;
            }

            return {
                title: match.title || "",
                league: match.topic || "",
                team1: match.firstTeam || "",
                team2: match.secondtTeam || "",
                team1_logo: match.firstTeamImage || "",
                team2_logo: match.secondtTeamImage || "",
                time: matchTime,
                date: dateVal,
                status: matchStatus,
                score: finalScore,
                channel: match.channel || "",
                id_live: match.channel || ""
            };
        });

        // حفظ في الكاش
        if (CACHE_CONFIG.matches.enabled) {
            setToCache(cacheKey, formattedMatches, CACHE_CONFIG.matches.ttl);
        }
        
        res.json(formattedMatches);

    } catch (error) { 
        console.error('Error fetching matches:', error.message);
        res.status(500).json({ error: true, message: error.message }); 
    }
});

// ==========================================
// 3. /resolve و /extract (مع الكاش)
// ==========================================
app.all("/resolve", async (req, res) => {
    try {
        const targetUrl = req.query.url || req.body.url;
        const channelId = req.query.id_live || req.body.id_live || "test";
        if (!targetUrl) return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        
        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json(result ? { success: true, ...result } : { error: true, message: "فشل" });
    } catch (error) { 
        res.status(500).json({ error: true, message: error.message }); 
    }
});

app.get("/extract", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        const channelId = req.query.id_live || "test";
        if (!targetUrl) return res.status(400).json({ error: true, message: "يرجى إرسال الرابط (url)" });
        
        const result = await resolveRedirectUrl(channelId, targetUrl);
        res.json({ success: result ? true : false, result: result });
    } catch (error) { 
        res.status(500).json({ error: true, message: error.message }); 
    }
});

// ==========================================
// قائمة الأقسام (Topics) - مع الكاش
// ==========================================
const allTopics = [
    // ... (نفس القائمة السابقة)
];

app.get("/get-all-topics", (req, res) => { 
    // محاولة جلب من الكاش
    const cacheKey = "topics:all";
    
    if (CACHE_CONFIG.topics.enabled) {
        const cacheResult = getFromCache(cacheKey);
        if (cacheResult.hit) {
            return res.json(cacheResult.data);
        }
    }
    
    // حفظ في الكاش
    if (CACHE_CONFIG.topics.enabled) {
        setToCache(cacheKey, allTopics, CACHE_CONFIG.topics.ttl);
    }
    
    res.json(allTopics); 
});

// ==========================================
// مسارات إدارة الكاش
// ==========================================

// الحصول على إحصائيات الكاش
app.get("/cache/stats", (req, res) => {
    const stats = getCacheStats();
    res.json(stats);
});

// مسح الكاش بالكامل
app.delete("/cache/clear", (req, res) => {
    const cleared = clearAllCache();
    res.json({ success: cleared, message: cleared ? "تم مسح الكاش بالكامل" : "فشل في مسح الكاش" });
});

// مسح كاش محدد حسب النوع
app.delete("/cache/clear/:type", (req, res) => {
    const type = req.params.type;
    let prefix = "";
    
    switch(type) {
        case 'channels':
            prefix = 'channels:';
            break;
        case 'streams':
            prefix = 'stream:';
            break;
        case 'matches':
            prefix = 'matches:';
            break;
        case 'redirect':
            prefix = 'redirect:';
            break;
        case 'resolve':
            prefix = 'resolve:';
            break;
        case 'topics':
            prefix = 'topics:';
            break;
        case 'live_id':
            prefix = 'live_id:';
            break;
        case 'last':
            prefix = 'last:';
            break;
        default:
            return res.status(400).json({ error: true, message: "نوع كاش غير معروف" });
    }
    
    const count = clearCacheByPrefix(prefix);
    res.json({ success: count > 0, cleared: count, message: `تم مسح ${count} عنصر من الكاش` });
});

// حذف كاش محدد (مثلاً: قناة معينة)
app.delete("/cache/channel/:id", (req, res) => {
    const id = req.params.id;
    let deleted = 0;
    
    deleted += deleteFromCache(`stream:${id}`);
    deleted += deleteFromCache(`redirect-data:${id}`);
    deleted += deleteFromCache(`live_id:${id}`);
    deleted += deleteFromCache(`last:${id}`);
    deleted += deleteFromCache(`resolve:${id}`);
    
    res.json({ success: deleted > 0, deleted: deleted, message: `تم حذف ${deleted} عنصر من الكاش للقناة ${id}` });
});

// تحديث مدة صلاحية الكاش
app.post("/cache/ttl", (req, res) => {
    const { type, ttl } = req.body;
    
    if (!type || !ttl) {
        return res.status(400).json({ error: true, message: "يرجى إرسال type و ttl" });
    }
    
    if (CACHE_CONFIG[type]) {
        CACHE_CONFIG[type].ttl = parseInt(ttl);
        res.json({ success: true, message: `تم تحديث TTL لـ ${type} إلى ${ttl} ثانية` });
    } else {
        res.status(400).json({ error: true, message: "نوع كاش غير معروف" });
    }
});

app.listen(PORT, () => { 
    console.log("🚀 Server running on port " + PORT); 
    console.log(`📦 نظام الكاش مفعل - الحد الأقصى: 1000 عنصر`);
    console.log(`⏱️ إعدادات الكاش:`, CACHE_CONFIG);
});
