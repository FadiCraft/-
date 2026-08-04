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
    } 
    else if (fakeUrl.includes("LOAD_BALANCER") || fakeUrl.includes("custom_handler")) {
        let channelName = "";
        if (fakeUrl.includes("LOAD_BALANCER")) {
            channelName = fakeUrl.match(/LOAD_BALANCERlive_tv_(.+?)\//)?.[1] || "";
        } else if (fakeUrl.includes("custom_handler")) {
            channelName = fakeUrl.match(/custom_handler_live_tv_(.+?)_description/)?.[1] || "";
        }

        return JSON.stringify({
            "url": `https://example-real-server.com/live/${channelName}/index.m3u8`, 
            "data": "",
            "acceptSSL": "1",
            "iframe": "",
            "headers": {}
        });
    } 
    else {
        return JSON.stringify({
            "url": fakeUrl,
            "data": "",
            "acceptSSL": "1",
            "iframe": "",
            "headers": {}
        });
    }
}

async function extractStreamUrl(channelId, fakeUrl) {
    try {
        const urlData = convertFakeUrl(fakeUrl);
        const rawData = `\r\n \n\n\n\n\n\n\n\n<html>\n<head>\n<title>91</title>\n\n<style>\nhtml, body {\n  margin: 0;\n  padding: 0;\n  height: 100%;\n  overflow: hidden;\n  background: black;\n}\n\n#player {\n  width: 100vw;\n  height: 100vh;\n}\n\n.container {\n  height: 100%;\n}\n</style>\n\n\n<script>(function(s){s.dataset.zone='10227946',s.src='https://llvpn.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>\n \n\n\n<script src="//cdn.jsdelivr.net/npm/@clappr/player@0.11.6/dist/clappr.min.js"></script>\n<script src="//cdn.jsdelivr.net/npm/clappr-pip@latest/dist/clappr-pip.min.js"></script>\n<script src="//cdn.jsdelivr.net/npm/@swarmcloud/hls/p2p-engine.min.js"></script>\n</head>\n\n<body class="container">\n\n<div id="player"></div>\n\n<script>\n(async () => {\n\n  const p2pConfig = {\n    live: true,\n    token: "greek",\n    channelId: "91",\n    announce: "https://ann.cdn-lab.shop/v1",\n    showSlogan: false,\n    sharePlaylist: false,\n    startFromSegmentOffset: 0,\n    trickleICE: true,\n  };\n\n\n\n  var player = new Clappr.Player({\n    source:window.atob('aHR0cHM6Ly94YW1lbGVvbi5waGFudGVtbGlzLnRvcC9mb3VyL3NlY3VyZS80OGFiMjhhZGQyMzI0NDk0ZmU2ZGM1NjE3ZTNkNTdkMC8xNzg1ODAxODUyL3ByZW1pdW05MS9pbmRleC5tM3U4'),\n    mediacontrol: { seekbar: "#FFFFFF", buttons: "#FFFFFF" },\n    mimeType: "application/x-mpegURL",\n    height: "100%",\n    width: "100%",\n    autoPlay: true,\n    mute: true,\n    plugins: [ClapprPip.PipButton, ClapprPip.PipPlugin],\n    playback: {\n      hlsjsConfig: {\n        maxBufferLength: 5,\n        liveSyncDurationCount: 3,\n      },\n    },\n  });\n\n  player.attachTo(document.getElementById("player"));\n  p2pConfig.hlsjsInstance = player.core.getCurrentPlayback()?._hls;\n  new P2PEngineHls(p2pConfig);\n\n})();\n</script>\n\n<div style="display:none;">\n  <script id="_waup77">\n    var _wau = _wau || [];\n    _wau.push(["classic", "ra5fzi2hwk", "p77"]);\n  </script>\n  <script async src="//waust.at/c.js"></script>\n</div>\n\n<script>\n    document.addEventListener('contextmenu', event => event.preventDefault());\n    document.onkeydown = function (e) {\n        if(e.keyCode == 123) return false;\n        if(e.ctrlKey && e.shiftKey && e.keyCode == 73) return false;\n        if(e.ctrlKey && e.shiftKey && e.keyCode == 74) return false;\n        if(e.ctrlKey && e.keyCode == 85) return false;\n    }\n</script>\n</body>\n</html>`;

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
            headers: {}
        };

        if (jsonResponse.data && jsonResponse.data.url) {
            try {
                const innerData = JSON.parse(jsonResponse.data.url);
                result.stream_url = innerData.url || null;
                if (innerData.headers) result.headers = innerData.headers;
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
            if (!result.stream_url) {
                const m3u8Match = jsonResponse.raw_data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
                if (m3u8Match) {
                    result.stream_url = m3u8Match[1];
                }
            }
        }

        return result;
    } catch (error) {
        return { stream_url: null, headers: {} };
    }
}

// 1. مسار جلب القنوات
app.get("/channels", async (req, res) => {
    // ... (هذا المسار كما هو بدون تغيير)
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

// 2. مسار جلب روابط البث المُعدل (Clean & Player Ready)
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const extract = req.query.extract === "true";
        const format = req.query.format; // format=m3u لإرجاع ملف IPTV مباشرة
        
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

        let playableStreams = [];

        // دالة مساعدة لمعالجة وفلترة الروابط
        const processStream = async (serverName, urlValue, agentValue) => {
            if (!urlValue || urlValue === "empty") return;

            let finalUrl = urlValue;
            let finalHeaders = {};

            // إذا كان الرابط JSON مدمج
            if (urlValue.startsWith("{") && urlValue.endsWith("}")) {
                try {
                    const parsed = JSON.parse(urlValue);
                    finalUrl = parsed.url || "";
                    if (parsed.headers) finalHeaders = parsed.headers;
                } catch (e) {}
            }

            // الاستخراج إذا لزم الأمر
            if (extract && (agentValue === "redirect" || agentValue === "double_redirect" || finalUrl.includes("LOAD_BALANCER"))) {
                const resolved = await extractStreamUrl(id_live, finalUrl);
                if (resolved.stream_url) {
                    finalUrl = resolved.stream_url;
                    if (resolved.headers) finalHeaders = Object.assign(finalHeaders, resolved.headers);
                }
            }

            // التأكد من أن الرابط النهائي حقيقي وقابل للتشغيل (يبدأ بـ http)
            if (finalUrl && finalUrl.startsWith("http")) {
                playableStreams.push({
                    quality: serverName,
                    url: finalUrl,
                    headers: finalHeaders
                });
            }
        };

        // 1. معالجة السيرفر الأساسي
        await processStream("السيرفر الأساسي", liveData.url, liveData.agent);

        // 2. معالجة السيرفرات الاحتياطية
        const backupStr = liveData.backup || "";
        if (backupStr) {
            const backupParts = backupStr.split("-;-");
            for (let i = 0; i < backupParts.length; i++) {
                const part = backupParts[i].trim();
                if (!part) continue;
                
                const subParts = part.split("--");
                const linkData = subParts[0] ? subParts[0].trim() : "";
                const agentData = subParts[1] ? subParts[1].trim() : "ExoPlayer";
                
                await processStream(`سيرفر ${playableStreams.length + 1}`, linkData, agentData);
            }
        }

        // إذا طلب المستخدم الرابط بصيغة ملف M3U للتشغيل المباشر
        if (format === "m3u") {
            let m3u8Content = "#EXTM3U\n";
            playableStreams.forEach(stream => {
                // دمج الهيدرز للـ VLC و ExoPlayer
                if (stream.headers && Object.keys(stream.headers).length > 0) {
                    for (const [key, value] of Object.entries(stream.headers)) {
                       if (key.toLowerCase() === 'user-agent') m3u8Content += `#EXTVLCOPT:http-user-agent=${value}\n`;
                       if (key.toLowerCase() === 'referer') m3u8Content += `#EXTVLCOPT:http-referrer=${value}\n`;
                    }
                }
                m3u8Content += `#EXTINF:-1 tvg-logo="${liveData.img_url || ''}", ${liveData.name || id_live} - ${stream.quality}\n`;
                m3u8Content += `${stream.url}\n`;
            });
            
            res.setHeader('Content-Type', 'audio/mpegurl; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${id_live}.m3u"`);
            return res.send(m3u8Content);
        }

        // إرجاع رد JSON نظيف ومبسط جداً للمشغل
        res.json({
            success: true,
            channel: {
                id: liveData.id_live || id_live,
                name: liveData.name || "",
                logo: liveData.img_url || ""
            },
            total_sources: playableStreams.length,
            sources: playableStreams
        });

    } catch (error) {
        console.error("Stream error:", error);
        res.status(500).json({ error: true, message: error.message });
    }
});

app.all("/extract", async (req, res) => {
    try {
        const channelId = req.query.id_live || req.body.id_live;
        const urlValue = req.query.url || req.body.url;
        
        if (!channelId || !urlValue) {
            return res.status(400).json({ error: true, message: "يرجى إرسال id_live و url" });
        }
        const result = await extractStreamUrl(channelId, urlValue);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

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
    {"id_topic":"249","name_topic":"السودان","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_sd.png","code":"sd"},
    {"id_topic":"216","name_topic":"تونس","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_tn.png","code":"tn"},
    {"id_topic":"212","name_topic":"المغرب","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ma.png","code":"ma"},
    {"id_topic":"213","name_topic":"الجزائر","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_dz.png","code":"dz"},
    {"id_topic":"218","name_topic":"ليبيا","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ly.png","code":"ly"},
    {"id_topic":"252","name_topic":"الصومال","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_so.png","code":"so"},
    {"id_topic":"355","name_topic":"Albania","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_al.png","code":"al"},
    {"id_topic":"93","name_topic":"Afghanistan","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_af.png","code":"af"},
    {"id_topic":"376","name_topic":"Andorra","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ad.png","code":"ad"},
    {"id_topic":"54","name_topic":"Argentina","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ar.png","code":"ar"},
    {"id_topic":"374","name_topic":"Armenia","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_am.png","code":"am"},
    {"id_topic":"297","name_topic":"Aruba","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_aw.png","code":"aw"},
    {"id_topic":"61","name_topic":"Australia","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_au.png","code":"au"},
    {"id_topic":"az","name_topic":"Azerbaijan","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_az.png","code":"az"},
    {"id_topic":"bs","name_topic":"Bahamas","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bs.png","code":"bs"},
    {"id_topic":"bd","name_topic":"Bangladesh","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bd.png","code":"bd"},
    {"id_topic":"bb","name_topic":"Barbados","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bb.png","code":"bb"},
    {"id_topic":"by","name_topic":"Belarus","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_by.png","code":"by"},
    {"id_topic":"0_be_0","name_topic":"Belgium","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_be.png","code":"be"},
    {"id_topic":"bz","name_topic":"Belize","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bz.png","code":"bz"},
    {"id_topic":"bj","name_topic":"Benin","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bj.png","code":"bj"},
    {"id_topic":"bm","name_topic":"Bermuda","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bm.png","code":"bm"},
    {"id_topic":"bt","name_topic":"Bhutan","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bt.png","code":"bt"},
    {"id_topic":"bo","name_topic":"Bolivia","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bo.png","code":"bo"},
    {"id_topic":"ba","name_topic":"Bosnia And Herzegovina","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ba.png","code":"ba"},
    {"id_topic":"bw","name_topic":"Botswana","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bw.png","code":"bw"},
    {"id_topic":"bv","name_topic":"Bouvet Island","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bv.png","code":"bv"},
    {"id_topic":"br","name_topic":"Brazil","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_br.png","code":"br"},
    {"id_topic":"io","name_topic":"British Indian Ocean Territory","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_io.png","code":"io"},
    {"id_topic":"bn","name_topic":"Brunei Darussalam","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bn.png","code":"bn"},
    {"id_topic":"bg","name_topic":"Bulgaria","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bg.png","code":"bg"},
    {"id_topic":"bf","name_topic":"Burkina Faso","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bf.png","code":"bf"},
    {"id_topic":"0_bi_0","name_topic":"Burundi","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_bi.png","code":"bi"},
    {"id_topic":"kh","name_topic":"Cambodia","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_kh.png","code":"kh"},
    {"id_topic":"cm","name_topic":"Cameroon","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_cm.png","code":"cm"},
    {"id_topic":"ca","name_topic":"Canada","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ca.png","code":"ca"},
    {"id_topic":"cv","name_topic":"Cape Verde","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_cv.png","code":"cv"},
    {"id_topic":"ky","name_topic":"Cayman Islands","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_ky.png","code":"ky"},
    {"id_topic":"cf","name_topic":"Central African Republic","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_cf.png","code":"cf"},
    {"id_topic":"td","name_topic":"Chad","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_td.png","code":"td"},
    {"id_topic":"cl","name_topic":"Chile","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_cl.png","code":"cl"},
    {"id_topic":"cn","name_topic":"China","img_url_topic":"http://logo.twoapistack.work/img/topics/ic_flag_cn.png","code":"cn"}
];

app.get("/get-all-topics", (req, res) => res.json(allTopics));

app.listen(PORT, () => console.log("Server is running on port " + PORT));
