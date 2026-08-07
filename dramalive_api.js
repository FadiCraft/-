// ==========================================
// مسار /stream معدل بالكامل لحل الروابط بشكل صحيح
// ==========================================
app.get("/stream", async (req, res) => {
    try {
        const id_live = req.query.id_live;
        const resolveAll = req.query.resolve === "true";

        if (!id_live) return res.status(400).json({ error: true, message: "يرجى إرسال id_live" });

        // 1. جلب بيانات القناة
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

        // ============================================
        // دالة مساعدة لمعالجة الرابط وتحديد نوعه
        // ============================================
        function processStreamUrl(url, agent, serverName, extraData = {}) {
            let streamObj = {
                server_name: serverName,
                url: url,
                agent: agent || "ExoPlayer",
                drm: null,
                headers: {},
                original_agent: agent || "ExoPlayer",
                resolved: false
            };

            // إذا كان الرابط فارغاً أو "empty" نتجاوز
            if (!url || url === "empty" || url === "") return null;

            // محاولة parse إذا كان JSON
            if (url.startsWith("{") && url.endsWith("}")) {
                try {
                    const jsonObj = JSON.parse(url);
                    streamObj.url = jsonObj.url || streamObj.url;
                    if (jsonObj.agent) streamObj.agent = jsonObj.agent;
                    if (jsonObj.headers) streamObj.headers = jsonObj.headers;
                    if (jsonObj.drm) streamObj.drm = jsonObj.drm;
                    if (jsonObj.iframe) streamObj.iframe = jsonObj.iframe;
                    // تحديث original_agent
                    streamObj.original_agent = streamObj.agent;
                } catch (e) {
                    // إذا فشل الـ parse، نستخدم الرابط كما هو
                }
            }

            // التحقق إذا كان الرابط يحتاج حل (redirect)
            const isRedirect = streamObj.original_agent === "redirect" || 
                              streamObj.original_agent === "double_redirect" ||
                              streamObj.url.includes(".LS.V2") ||
                              streamObj.url.includes("daddy_") ||
                              streamObj.url.includes("LOAD_BALANCER");

            // إذا كان الرابط يحتاج حل و resolveAll = true
            if (isRedirect && resolveAll) {
                streamObj.resolved = true;
                return streamObj; // سيتم حله لاحقاً
            }

            return streamObj;
        }

        // ============================================
        // معالجة السيرفر الأساسي
        // ============================================
        const mainUrl = liveData.url || "";
        const mainAgent = liveData.agent || "";

        if (mainUrl && mainUrl !== "empty") {
            const mainStream = processStreamUrl(
                mainUrl, 
                mainAgent, 
                "السيرفر الأساسي"
            );
            if (mainStream) parsedStreams.push(mainStream);
        }

        // ============================================
        // معالجة السيرفرات الاحتياطية
        // ============================================
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

                const backupStream = processStreamUrl(
                    linkData,
                    agentData,
                    `سيرفر ${parsedStreams.length + 1}`
                );
                if (backupStream) parsedStreams.push(backupStream);
            }
        }

        // ============================================
        // حل الروابط التي تحتاج resolve (إذا كان resolveAll = true)
        // ============================================
        if (resolveAll) {
            for (let i = 0; i < parsedStreams.length; i++) {
                const stream = parsedStreams[i];
                
                // فقط نحل الروابط التي تحتاج حل
                if (!stream.resolved) continue;

                try {
                    let resolved = null;
                    const url = stream.url;
                    const agent = stream.original_agent;

                    // تحديد نوع الحل المطلوب
                    if (agent === "double_redirect" || url.includes("double_redirect")) {
                        resolved = await resolveDoubleRedirect(id_live, url);
                    } else if (agent === "redirect" || url.includes(".LS.V2") || url.includes("daddy_") || url.includes("LOAD_BALANCER")) {
                        resolved = await resolveRedirectServer(id_live, url);
                    }

                    if (resolved && resolved.stream_url) {
                        // تحديث معلومات السيرفر بالرابط الحقيقي
                        stream.url = resolved.stream_url;
                        stream.agent = resolved.agent || "ExoPlayer";
                        stream.headers = resolved.headers || {};
                        stream.server_name += " ✅";
                        stream.resolved_success = true;
                        
                        // إذا كان الرابط النهائي هو m3u8 أو mpd، نضيف هذا المعلومات
                        if (stream.url.includes(".m3u8")) {
                            stream.type = "m3u8";
                        } else if (stream.url.includes(".mpd")) {
                            stream.type = "mpd";
                        } else {
                            stream.type = "unknown";
                        }
                    } else {
                        // إذا فشل الحل، نترك الرابط كما هو مع إشارة الفشل
                        stream.server_name += " ❌ (فشل الحل)";
                        stream.resolved_success = false;
                    }
                } catch (err) {
                    console.error(`Failed to resolve stream ${i}:`, err.message);
                    stream.server_name += " ❌ (خطأ)";
                    stream.resolved_success = false;
                }
            }
        }

        // ============================================
        // إرجاع النتيجة النهائية
        // ============================================
        res.json({
            id_live: liveData.id_live || id_live,
            name: liveData.name || "",
            img_url: liveData.img_url || "",
            streams: parsedStreams.map(s => ({
                server_name: s.server_name,
                url: s.url,
                agent: s.agent,
                drm: s.drm || null,
                headers: s.headers || {},
                type: s.type || null,
                resolved: s.resolved_success !== undefined ? s.resolved_success : null
            }))
        });

    } catch (error) {
        console.error("Error in /stream:", error);
        res.status(500).json({ error: true, message: error.message });
    }
});
