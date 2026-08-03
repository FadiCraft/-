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
// دالة: فك الرابط الوهمي واستخراج الرابط النهائي
// ==========================================
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
            stream_url: null,
            headers: null,
            agent: "ExoPlayer"
        };

        // استخراج الهيدرز والرابط المبدئي إذا وجد
        if (jsonResponse.url) {
            try {
                const innerJson = JSON.parse(jsonResponse.url);
                if (innerJson.headers) finalResult.headers = innerJson.headers;
                if (innerJson.url) finalResult.stream_url = innerJson.url;
            } catch (e) {
                finalResult.stream_url = jsonResponse.url;
            }
        }

        // استخراج رابط الـ m3u8 المخفي داخل كود الـ HTML (عبر فك تشفير Base64 لـ window.atob)
        const rawData = jsonResponse.raw_data || JSON.stringify(jsonResponse);
        const atobMatches = rawData.match(/window\.atob\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/g);
        
        if (atobMatches) {
            for (let match of atobMatches) {
                const base64Match = match.match(/['"]([A-Za-z0-9+/=]+)['"]/);
                if (base64Match && base64Match[1]) {
                    try {
                        const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                        if (decoded.includes(".m3u8") || decoded.startsWith("http")) {
                            finalResult.stream_url = decoded;
                            break;
                        }
                    } catch (err) {}
                }
            }
        }

        return finalResult;

    } catch (error) {
        console.error("Error resolving redirect:", error.message);
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

app.all("/resolve", async (req, res) => {
    try {
        // إذا لم تقم بإرسال رابط، سيقوم بتجربة هذا الرابط الافتراضي تلقائياً للتأكد من عمله
        const targetUrl = req.query.url || req.body.url || "http://.LS.V2daddy_91/s"; 
        
        const customUserId = req.query.user_id || req.body.user_id;
        const customDeviceId = req.query.device_id || req.body.device_id;
        
        const result = await resolveRedirectUrl(targetUrl, customUserId, customDeviceId);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// قائمة الأقسام (Topics)
const allTopics = [
    {"id_topic":"hot_now","name_topic":"الأكثر مشاهدة","img_url_topic":"http://logo.twoapistack.work/img/topics/hot_now.png","code":""},
    {"id_topic":"live_matches","name_topic":"مباريات مباشرة","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_fire.jpg","code":""},
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
    {"id_topic":"unsorted","name_topic":"unsorted","img_url_topic":"","code":""},
    {"id_topic":"relax","name_topic":"ريلاكس","img_url_topic":"http://logo.twoapistack.work/img/topics/relax.png","code":""},
    {"id_topic":"science","name_topic":"علوم","img_url_topic":"http://logo.twoapistack.work/img/topics/science.png","code":""},
    {"id_topic":"anime","name_topic":"انيمي","img_url_topic":"http://logo.twoapistack.work/img/topics/anime.jpg","code":""},
    {"id_topic":"roya","name_topic":"رؤيا","img_url_topic":"https://backend.roya-tv.com/imagechanger/Size01Q40R11/images/channels/iMoPuU3u5qnqMsL.png","code":""},
    {"id_topic":"twitch","name_topic":"Live Twitch","img_url_topic":"http://logo.twoapistack.work/img/topics/twitch.png","code":""},
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

app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
