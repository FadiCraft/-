const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. دوال التشفير وفك التشفير
// (تأكد من وضع مفاتيح وطريقة التشفير الخاصة بتطبيقك هنا)
// ==========================================
function encryptAES(text) {
    // ⚠️ استبدل هذا الكود بطريقة التشفير الفعلية التي تستخدمها
    // هذا مجرد إرجاع للنص لتوضيح مكان وضع التشفير
    // return crypto.createCipheriv(...).update(text, 'utf8', 'base64') + ...
    return text; 
}

function decryptAES(encryptedText) {
    // ⚠️ استبدل هذا الكود بطريقة فك التشفير الفعلية التي تستخدمها
    return encryptedText;
}

// ==========================================
// 2. دالة تحويل الرابط الوهمي (Fake URL)
// ==========================================
function convertFakeUrl(fakeUrl) {
    if (fakeUrl && fakeUrl.includes("daddy_")) {
        const daddyId = fakeUrl.match(/daddy_(\d+)/)?.[1] || "";
        return JSON.stringify({
            "url": `https://hamis.romponalis.st/premiumtv/daddy4.php?id=${daddyId}`,
            "data": "",
            "acceptSSL": "1",
            "iframe": `https://daddylive.mov/embed/embed.php?id=${daddyId}&player=1&source=tv.json`,
            "headers": {
                "Referer": "https://dlhd.pk/"
            }
        });
    } else {
        // تمرير السيرفرات الأخرى (مثل LOAD_BALANCER) كما هي
        return JSON.stringify({
            "url": fakeUrl,
            "data": "",
            "acceptSSL": "1",
            "iframe": "",
            "headers": {}
        });
    }
}

// ==========================================
// 3. دالة استخراج رابط البث المباشر (Extraction)
// ==========================================
async function extractStreamUrl(channelId, fakeUrl, agentType = "double_redirect") {
    try {
        const urlData = convertFakeUrl(fakeUrl);
        let rawData = "";

        // محاولة جلب محتوى الصفحة إذا كان الرابط حقيقياً (مثل الويب)
        try {
            const parsedUrl = JSON.parse(urlData);
            const targetUrl = parsedUrl.iframe || parsedUrl.url;
            if (targetUrl && targetUrl.startsWith("http")) {
                const pageResponse = await axios.get(targetUrl, {
                    headers: parsedUrl.headers || {},
                    timeout: 8000
                });
                rawData = pageResponse.data;
            }
        } catch (e) {
            // تجاهل الخطأ، السيرفر سيتعامل مع الرابط مباشرة
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
            "appCount": "{\"adsFailed\":80,\"adsLoaded\":64,\"adsShowed\":22,\"runCount\":10}",
            "mainServer": "http://main.eastgoessouth.online/api/live/livedrama/v13.0.0/",
            "type": "tv",
            "id": channelId,
            "url": urlData,
            "agent": agentType,
            "raw_data": rawData // أصبح ديناميكياً
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

        // فك التشفير وتحويل الرد إلى JSON
        const decryptedText = decryptAES(Buffer.from(response.data).toString("utf-8"));
        const jsonResponse = JSON.parse(decryptedText);

        let result = {
            stream_url: null,
            headers: {},
            agent: "ExoPlayer",
            full_response: jsonResponse
        };

        // 1. استخراج الرابط من داخل data.url (إن وجد)
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

        // 2. البحث في raw_data عن window.atob (.m3u8 و .mpd)
        if (!result.stream_url && jsonResponse.raw_data) {
            const atobMatches = jsonResponse.raw_data.match(/window\.atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/g);
            if (atobMatches) {
                for (let match of atobMatches) {
                    const base64Match = match.match(/['"]([A-Za-z0-9+/=]+)['"]/);
                    if (base64Match && base64Match[1]) {
                        try {
                            const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                            if (decoded.includes(".m3u8") || decoded.includes(".mpd") || decoded.startsWith("http")) {
                                result.stream_url = decoded;
                                break;
                            }
                        } catch (err) {}
                    }
                }
            }
        }

        // 3. الفلترة الشاملة في النص الكامل للرد
        if (!result.stream_url) {
            const globalMatch = decryptedText.match(/(https?:\/\/[^\s"'<>]+\.(m3u8|mpd)[^\s"'\\]*)/);
            if (globalMatch) {
                result.stream_url = globalMatch[1].replace(/\\/g, '');
            }
        }

        return result;

    } catch (error) {
        console.error("Extraction Error:", error.message);
        return { stream_url: null, error: error.message };
    }
}

// ==========================================
// 4. مسارات API (Routes)
// ==========================================

// مسار الفحص المباشر لأي سيرفر
app.all("/extract", async (req, res) => {
    try {
        const channelId = req.query.id_live || req.body.id_live;
        const urlValue = req.query.url || req.body.url;
        // افتراض double_redirect إذا لم يتم تحديده
        const agentType = req.query.agent || req.body.agent || "double_redirect"; 
        
        if (!channelId || !urlValue) {
            return res.status(400).json({ error: true, message: "البيانات ناقصة: تأكد من إرسال id_live و url" });
        }

        const result = await extractStreamUrl(channelId, urlValue, agentType);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// المسار الرئيسي للستريم (مثال لدمجه مع جلب القناة)
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const extract = req.query.extract !== 'false'; 
        
        if (!id_live) {
            return res.status(400).json({ error: true, message: "id_live مطلوب" });
        }

        // هنا يُفترض أنك تجلب بيانات القناة (url و agent) من الـ API الأساسي لتطبيقك
        // سنفترض هذه المتغيرات كتجربة
        let mainUrl = req.query.url || "daddy_91"; 
        let mainAgent = req.query.agent || "double_redirect"; 
        
        let streamObj = {
            id_live: id_live,
            direct_url: null,
            stream_headers: {}
        };

        // تمرير المتغيرات المطلوبة ديناميكياً لاستخراج الرابط
        if (extract && (mainAgent === "redirect" || mainAgent === "double_redirect")) {
            const resolved = await extractStreamUrl(id_live, mainUrl, mainAgent);
            if (resolved.stream_url) {
                streamObj.direct_url = resolved.stream_url;
                streamObj.stream_headers = resolved.headers;
            }
        }

        res.json(streamObj);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// ==========================================
// 5. تشغيل الخادم
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل بنجاح على المنفذ ${PORT}`);
});
