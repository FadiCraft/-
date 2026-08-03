const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

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

// 1. مسار جلب القنوات حسب القسم (Topic)
app.get("/channels", async (req, res) => {
    try {
        const topic = req.query.topic || "arabic_sport";
        const postData = {
            "user_id": "_19449_1785337989457_notloggedin.com_dramalive3",
            "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe",
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
            "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
            "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
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
        
        // استخراج مصفوفة القنوات (في حال كان الرد يحتوي على القنوات مباشرة أو داخل كائن)
        let rawChannels = [];
        if (Array.isArray(jsonResponse)) {
            rawChannels = jsonResponse;
        } else if (jsonResponse.channels) {
            rawChannels = jsonResponse.channels;
        } else if (jsonResponse.live) {
            rawChannels = jsonResponse.live;
        }

        // بناء الهيكل الثابت الذي طلبته
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

// 2. مسار جلب روابط البث للقناة (Stream) بشكل ذكي
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        if (!id_live) return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });

        const postData = {
            "user_id": "_19449_1785337989457_notloggedin.com_dramalive3",
            "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe",
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
            "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
            "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
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

        // 1. فحص الرابط الأساسي (url)
        const mainUrl = liveData.url || "";
        // نتأكد أن الرابط حقيقي وليس رابط وهمي للمشغل الداخلي
        if (mainUrl.startsWith("http") && !mainUrl.includes(".LS.V2live")) {
            parsedStreams.push({
                server_name: "السيرفر الأساسي",
                url: mainUrl,
                agent: liveData.agent || "ExoPlayer",
                drm: null
            });
        }

        // 2. فحص وتفكيك الروابط الاحتياطية (backup)
        const backupStr = liveData.backup || "";
        if (backupStr) {
            // فصل السيرفرات المتعددة باستخدام الفاصل -;-
            const parts = backupStr.split("-;-");
            
            parts.forEach((part, index) => {
                part = part.trim();
                if (!part) return;

                // فصل الرابط عن الـ Agent باستخدام الفاصل --
                const subParts = part.split("--");
                const linkData = subParts[0] ? subParts[0].trim() : "";
                let agentData = subParts[1] ? subParts[1].trim() : "ExoPlayer";

                if (!linkData) return;

                let streamObj = {
                    server_name: `سيرفر ${parsedStreams.length + 1}`,
                    url: "",
                    agent: agentData,
                    drm: null
                };

                // فحص إذا كان الرابط عبارة عن كائن JSON (مثل الروابط التي تتطلب DRM)
                if (linkData.startsWith("{") && linkData.endsWith("}")) {
                    try {
                        const jsonObj = JSON.parse(linkData);
                        streamObj.url = jsonObj.url || "";
                        
                        // سحب الـ User-Agent إذا كان مدمجاً داخل الـ JSON
                        if (jsonObj.agent) streamObj.agent = jsonObj.agent;
                        if (jsonObj.headers && jsonObj.headers["User-Agent"]) {
                            streamObj.agent = jsonObj.headers["User-Agent"];
                        }
                        
                        // سحب مفاتيح التشفير DRM إن وجدت (مهم جداً لتشغيل بعض القنوات على ExoPlayer)
                        if (jsonObj.drm) {
                            streamObj.drm = jsonObj.drm;
                        }
                    } catch (e) {
                        // في حال فشل التحليل، نعتبره خطأ ونتجاهله
                    }
                } else {
                    // إذا كان الرابط عادياً وليس JSON
                    streamObj.url = linkData;
                }

                // إضافة الرابط للمصفوفة فقط إذا كان يبدأ بـ http (لضمان صحته)
                if (streamObj.url.startsWith("http")) {
                    parsedStreams.push(streamObj);
                }
            });
        }

        // 3. بناء الهيكل الذكي والنهائي للمشغل
        const finalResponse = {
            id_live: liveData.id_live || id_live,
            name: liveData.name || "",
            img_url: liveData.img_url || "",
            streams: parsedStreams // هذه المصفوفة تحتوي على جميع الروابط نظيفة وجاهزة
        };

        res.json(finalResponse);

    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

// قائمة جميع الأقسام الكاملة (81 قسم مع الصور)
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

// مسار جلب القائمة الكاملة للأقسام
app.get("/get-all-topics", (req, res) => {
    res.json(allTopics);
});

app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
});
