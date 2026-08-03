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

// تحويل الرابط الوهمي إلى JSON
function convertFakeUrl(fakeUrl) {
    if (fakeUrl.includes("daddy_")) {
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
        return JSON.stringify({
            "url": fakeUrl,
            "data": "",
            "acceptSSL": "1",
            "iframe": "",
            "headers": {}
        });
    }
}

// الدالة الكاملة لاستخراج الرابط (خطوة واحدة ببيانات التطبيق الأصلية)
async function extractStreamUrl(channelId, fakeUrl) {
    try {
        // تجهيز الرابط الوهمي
        const urlData = convertFakeUrl(fakeUrl);

        // هذا هو الـ raw_data اللي التطبيق بيبعته (HTML كامل)
        const rawData = `\r\n \n\n\n\n\n\n\n\n<html>\n<head>\n<title>91</title>\n\n<style>\nhtml, body {\n  margin: 0;\n  padding: 0;\n  height: 100%;\n  overflow: hidden;\n  background: black;\n}\n\n#player {\n  width: 100vw;\n  height: 100vh;\n}\n\n.container {\n  height: 100%;\n}\n</style>\n\n\n<script>(function(s){s.dataset.zone='10227946',s.src='https://llvpn.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>\n \n\n\n<script src="//cdn.jsdelivr.net/npm/@clappr/player@0.11.6/dist/clappr.min.js"></script>\n<script src="//cdn.jsdelivr.net/npm/clappr-pip@latest/dist/clappr-pip.min.js"></script>\n<script src="//cdn.jsdelivr.net/npm/@swarmcloud/hls/p2p-engine.min.js"></script>\n</head>\n\n<body class="container">\n\n<div id="player"></div>\n\n<script>\n(async () => {\n\n  const p2pConfig = {\n    live: true,\n    token: "greek",\n    channelId: "91",\n    announce: "https://ann.cdn-lab.shop/v1",\n    showSlogan: false,\n    sharePlaylist: false,\n    startFromSegmentOffset: 0,\n    trickleICE: true,\n  };\n\n\n\n  var player = new Clappr.Player({\n    source:window.atob('aHR0cHM6Ly94YW1lbGVvbi5waGFudGVtbGlzLnRvcC9mb3VyL3NlY3VyZS80OGFiMjhhZGQyMzI0NDk0ZmU2ZGM1NjE3ZTNkNTdkMC8xNzg1ODAxODUyL3ByZW1pdW05MS9pbmRleC5tM3U4'),\n    mediacontrol: { seekbar: "#FFFFFF", buttons: "#FFFFFF" },\n    mimeType: "application/x-mpegURL",\n    height: "100%",\n    width: "100%",\n    autoPlay: true,\n    mute: true,\n    plugins: [ClapprPip.PipButton, ClapprPip.PipPlugin],\n    playback: {\n      hlsjsConfig: {\n        maxBufferLength: 5,\n        liveSyncDurationCount: 3,\n      },\n    },\n  });\n\n  player.attachTo(document.getElementById("player"));\n  p2pConfig.hlsjsInstance = player.core.getCurrentPlayback()?._hls;\n  new P2PEngineHls(p2pConfig);\n\n})();\n</script>\n\n<div style="display:none;">\n  <script id="_waup77">\n    var _wau = _wau || [];\n    _wau.push(["classic", "ra5fzi2hwk", "p77"]);\n  </script>\n  <script async src="//waust.at/c.js"></script>\n</div>\n\n<script>\n    // disable right click\n    document.addEventListener('contextmenu', event => event.preventDefault());\n\n    document.onkeydown = function (e) {\n\n        // disable F12 key\n        if(e.keyCode == 123) {\n            return false;\n        }\n\n        // disable I key\n        if(e.ctrlKey && e.shiftKey && e.keyCode == 73){\n            return false;\n        }\n\n        // disable J key\n        if(e.ctrlKey && e.shiftKey && e.keyCode == 74) {\n            return false;\n        }\n\n        // disable U key\n        if(e.ctrlKey && e.keyCode == 85) {\n            return false;\n        }\n    }\n\n</script>\n\n\n\n\n  \n\n</body>\n</html>`;

        // البيانات بالضبط زي ما التطبيق ببعتها
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
            "agent": "double_redirect",
            "raw_data": rawData
        };

        console.log("Sending request with raw_data length:", rawData.length);
        
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
        console.log("Full response:", decryptedText);
        
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

        // البحث في raw_data عن window.atob
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
            
            if (!result.stream_url) {
                const m3u8Match = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
                if (m3u8Match) {
                    result.stream_url = m3u8Match[1];
                }
            }
        }

        return result;

    } catch (error) {
        console.error("Error:", error.message);
        return { stream_url: null, error: error.message };
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
                const resolved = await extractStreamUrl(id_live, mainUrl);
                if (resolved.stream_url) {
                    streamObj.direct_url = resolved.stream_url;
                    streamObj.stream_headers = resolved.headers;
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
                    } catch (e) {
                        streamObj.url = linkData;
                    }
                } else {
                    streamObj.url = linkData;
                }

                if (extract && (agentData === "redirect" || agentData === "double_redirect")) {
                    const resolved = await extractStreamUrl(id_live, streamObj.url);
                    if (resolved.stream_url) {
                        streamObj.direct_url = resolved.stream_url;
                        streamObj.stream_headers = resolved.headers;
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

// 3. مسار استخراج رابط مباشر
app.all("/extract", async (req, res) => {
    try {
        const channelId = req.query.id_live || req.body.id_live;
        const urlValue = req.query.url || req.body.url;
        
        if (!channelId || !urlValue) {
            return res.status(400).json({
                error: true,
                message: "يرجى إرسال id_live و url"
            });
        }

        const result = await extractStreamUrl(channelId, urlValue);
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
