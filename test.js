const express = require('express');
const app = express();

app.set('json spaces', 2);

// القالب الثابت الذي سيتم إرجاعه في كل الحالات
const DEFAULT_RESPONSE = [{
    "id": "",
    "title": "",
    "img": "",
    "quality_144P": "",
    "quality_360P": "",
    "quality_720P": "",
    "quality_1080P": "",
    "quality_MP3": ""
}];

// دالة ذكية لفحص الرابط (تعيد الرابط إذا كان يعمل، أو "" إذا كان معطلاً)
async function checkUrlIsAlive(url) {
    if (!url) return "";
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 ثوانٍ كحد أقصى

        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 404 || response.status === 410 || response.status === 400) {
            return ""; 
        }
        return url; 
    } catch (error) {
        return "";
    }
}

// دالة للبحث واستخراج البيانات وترتيبها في الهيكل المطلوب
function parseAndFormatData(data) {
    let result = {
        id: "",
        title: "",
        img: "",
        quality_144P: "",
        quality_360P: "",
        quality_720P: "",
        quality_1080P: "",
        quality_MP3: ""
    };

    let mp3Links = [];

    function search(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(item => search(item));
        } else if (obj !== null && typeof obj === 'object') {
            
            // استخراج البيانات الأساسية
            if (!result.id && obj.id) result.id = String(obj.id);
            if (!result.title && obj.title) result.title = String(obj.title);
            if (!result.img && (obj.thumbnail || obj.picture || obj.thumb || obj.image)) {
                result.img = String(obj.thumbnail || obj.picture || obj.thumb || obj.image);
            }

            // استخراج وتصنيف الروابط
            if (obj.download_url && obj.download_url.trim() !== "") {
                let format = (obj.format || "").toUpperCase();
                let quality = (obj.quality || "").toUpperCase();
                let url = obj.download_url;

                if (format.includes("MP3") || format.includes("AUDIO")) {
                    mp3Links.push({ url, quality });
                } else {
                    // توزيع جودات الفيديو
                    if (quality.includes("144") && !result.quality_144P) result.quality_144P = url;
                    if (quality.includes("360") && !result.quality_360P) result.quality_360P = url;
                    if (quality.includes("720") && !result.quality_720P) result.quality_720P = url;
                    if (quality.includes("1080") && !result.quality_1080P) result.quality_1080P = url;
                }
            }

            Object.values(obj).forEach(val => search(val));
        }
    }

    search(data);

    // اختيار **أقل** جودة MP3 متوفرة لتوفير استهلاك البيانات
    if (mp3Links.length > 0) {
        mp3Links.sort((a, b) => {
            let qa = parseInt(a.quality.replace(/\D/g, '')) || 0;
            let qb = parseInt(b.quality.replace(/\D/g, '')) || 0;
            // ترتيب تصاعدي: الأقل جودة سيكون في البداية (index 0)
            return qa - qb; 
        });
        result.quality_MP3 = mp3Links[0].url;
    }

    return result;
}





app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query) {
        return res.json({ error: "الرجاء إدخال كلمة البحث" });
    }

    try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
            }
        });
        
        const html = await response.text();
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        
        if (!match || !match[1]) return res.json([]);

        const jsonData = JSON.parse(match[1]);
        let results = [];

        // دالة تكرارية للبحث في كل أعماق البيانات لجلب كل الفيديوهات
        function extractVideos(obj) {
            if (Array.isArray(obj)) {
                obj.forEach(extractVideos);
            } else if (obj !== null && typeof obj === 'object') {
                if (obj.videoRenderer && obj.videoRenderer.videoId) {
                    const video = obj.videoRenderer;
                    results.push({
                        id: video.videoId || "",
                        title: video.title?.runs?.[0]?.text || "",
                        video_url: `https://www.youtube.com/watch?v=${video.videoId}`,
                        thumbnail: video.thumbnail?.thumbnails?.[0]?.url || "",
                        views: video.viewCountText?.simpleText || video.shortViewCountText?.simpleText || "",
                        published_at: video.publishedTimeText?.simpleText || "",
                        // الهيكل المسطح الجديد
                        channel_name: video.ownerText?.runs?.[0]?.text || "",
                        channel_url: video.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url 
                                     ? `https://www.youtube.com${video.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}` 
                                     : "",
                        channel_avatar: video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || ""
                    });
                }
                Object.values(obj).forEach(extractVideos);
            }
        }

        extractVideos(jsonData.contents || {});

        // تنظيف الفيديوهات المكررة (لأن يوتيوب أحياناً يكرر الفيديو في المقترحات)
        const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

        res.json(uniqueResults);

    } catch (error) {
        console.error("Search Error:", error);
        res.json([]);
    }
});









// ============ مسار استخراج بيانات القناة فقط ============
app.get('/api/channel/info', async (req, res) => {
    const channelUrl = req.query.url;
    
    if (!channelUrl) {
        return res.json({ 
            error: "الرجاء إدخال رابط القناة",
            example: "/api/channel/info?url=https://www.youtube.com/@IShowSpeed"
        });
    }

    try {
        const response = await fetch(channelUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const html = await response.text();
        
        // استخراج ytInitialData
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        if (!match || !match[1]) {
            return res.json({ error: "لم يتم العثور على بيانات القناة" });
        }

        const jsonData = JSON.parse(match[1]);
        
        let channelInfo = {
            name: "",
            handle: "",
            avatar: "",
            banner: "",
            subscribers: "",
            videos_count: "",
            description: "",
            verified: false,
            social_links: []
        };

        // استخراج اسم القناة والمقبض من الرابط أولاً
        const handleMatch = channelUrl.match(/@([^\/]+)/);
        if (handleMatch) {
            channelInfo.handle = `@${handleMatch[1]}`;
        }

        // دالة لاستخراج النص
        function extractText(obj) {
            if (!obj) return "";
            if (typeof obj === 'string') return obj;
            if (obj.content) return obj.content;
            if (obj.simpleText) return obj.simpleText;
            if (obj.runs && Array.isArray(obj.runs)) {
                return obj.runs.map(run => run.text || "").join("");
            }
            return "";
        }

        // البحث العميق عن معلومات القناة
        function searchChannelInfo(obj, path = "") {
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => searchChannelInfo(item, `${path}[${index}]`));
            } else if (obj !== null && typeof obj === 'object') {
                
                // البحث عن header
                if (path.includes("pageHeader") || path.includes("header") || path.includes("Header")) {
                    
                    // استخراج العنوان
                    if (obj.ytPageHeaderViewModelTitle || obj.dynamicTextViewModelH1 || obj.ytDynamicTextViewModel) {
                        const titleObj = obj.ytPageHeaderViewModelTitle || obj.dynamicTextViewModelH1 || obj.ytDynamicTextViewModel;
                        
                        // البحث في الأعماق
                        function findTitle(o) {
                            if (!o) return "";
                            if (typeof o === 'string') return o;
                            if (o.content) return o.content;
                            if (o.runs && Array.isArray(o.runs)) {
                                return o.runs.map(r => r.text || "").join("");
                            }
                            if (o.ytAttributedStringHost) {
                                return findTitle(o.ytAttributedStringHost);
                            }
                            if (o.dynamicTextViewModelH1) {
                                return findTitle(o.dynamicTextViewModelH1);
                            }
                            if (o.ytDynamicTextViewModel) {
                                return findTitle(o.ytDynamicTextViewModel);
                            }
                            // البحث في الخصائص
                            for (let key in o) {
                                if (typeof o[key] === 'object') {
                                    const result = findTitle(o[key]);
                                    if (result) return result;
                                }
                            }
                            return "";
                        }
                        
                        const title = findTitle(titleObj);
                        if (title && title !== "Verified" && !title.includes("@")) {
                            channelInfo.name = title;
                            
                            // التحقق من التوثيق
                            const titleStr = JSON.stringify(titleObj);
                            if (titleStr.includes("Verified")) {
                                channelInfo.verified = true;
                            }
                        }
                    }
                    
                    // استخراج الصورة الرمزية
                    const avatarObj = obj.ytDecoratedAvatarViewModel || obj.ytDecoratedAvatarViewModelHost;
                    if (avatarObj) {
                        function findImage(o, depth = 0) {
                            if (!o || depth > 10) return "";
                            if (o.src && (o.src.includes("yt3.googleusercontent") || o.src.includes("ggpht"))) {
                                return o.src;
                            }
                            if (o.url && (o.url.includes("yt3.googleusercontent") || o.url.includes("ggpht"))) {
                                return o.url;
                            }
                            if (o.sources && Array.isArray(o.sources) && o.sources[0]?.url) {
                                return o.sources[0].url;
                            }
                            for (let key in o) {
                                if (typeof o[key] === 'object') {
                                    const result = findImage(o[key], depth + 1);
                                    if (result) return result;
                                }
                            }
                            return "";
                        }
                        
                        const avatar = findImage(avatarObj);
                        if (avatar) {
                            channelInfo.avatar = avatar;
                        }
                    }
                    
                    // استخراج المشتركين وعدد الفيديوهات
                    const metadataObj = obj.ytContentMetadataViewModel || obj.ytContentMetadataViewModelHost;
                    if (metadataObj) {
                        function findTexts(o, texts = [], depth = 0) {
                            if (!o || depth > 10) return texts;
                            
                            if (o.content && typeof o.content === 'string') {
                                texts.push(o.content);
                            }
                            if (o.runs && Array.isArray(o.runs)) {
                                const text = o.runs.map(r => r.text || "").join("");
                                if (text) texts.push(text);
                            }
                            
                            for (let key in o) {
                                if (typeof o[key] === 'object') {
                                    findTexts(o[key], texts, depth + 1);
                                }
                            }
                            return texts;
                        }
                        
                        const allTexts = findTexts(metadataObj);
                        
                        allTexts.forEach(text => {
                            if (text.startsWith("@") && !channelInfo.handle) {
                                channelInfo.handle = text;
                            } else if (text.includes("subscriber") && !channelInfo.subscribers) {
                                channelInfo.subscribers = text;
                            } else if (text.includes("video") && !channelInfo.videos_count) {
                                channelInfo.videos_count = text;
                            }
                        });
                    }
                    
                    // استخراج الوصف
                    const descObj = obj.ytDescriptionPreviewViewModel || obj.ytDescriptionPreviewViewModelHost;
                    if (descObj) {
                        function findDescription(o, depth = 0) {
                            if (!o || depth > 10) return "";
                            if (o.content && typeof o.content === 'string' && o.content !== "...more") {
                                return o.content;
                            }
                            if (o.runs && Array.isArray(o.runs)) {
                                const text = o.runs.map(r => r.text || "").join("");
                                if (text && text !== "...more") {
                                    return text;
                                }
                            }
                            for (let key in o) {
                                if (typeof o[key] === 'object') {
                                    const result = findDescription(o[key], depth + 1);
                                    if (result && !result.includes("...more")) return result;
                                }
                            }
                            return "";
                        }
                        
                        channelInfo.description = findDescription(descObj);
                    }
                    
                    // استخراج الروابط الاجتماعية
                    const attrObj = obj.ytAttributionViewModel || obj.ytAttributionViewModelHost;
                    if (attrObj) {
                        function findLinks(o, links = [], depth = 0) {
                            if (!o || depth > 10) return links;
                            
                            if (o.url && typeof o.url === 'string' && o.url.includes('http')) {
                                links.push({
                                    platform: "Link",
                                    url: o.url
                                });
                            }
                            if (o.href && typeof o.href === 'string' && o.href.includes('http')) {
                                links.push({
                                    platform: "Link",
                                    url: o.href
                                });
                            }
                            
                            for (let key in o) {
                                if (typeof o[key] === 'object') {
                                    findLinks(o[key], links, depth + 1);
                                }
                            }
                            return links;
                        }
                        
                        const links = findLinks(attrObj);
                        if (links.length > 0) {
                            channelInfo.social_links = links.slice(0, 5);
                        }
                    }
                }
                
                Object.entries(obj).forEach(([key, value]) => {
                    searchChannelInfo(value, `${path}.${key}`);
                });
            }
        }

        searchChannelInfo(jsonData);
        
        // تنظيف البيانات
        if (!channelInfo.name && channelInfo.handle) {
            channelInfo.name = channelInfo.handle.replace("@", "");
        }
        
        // تنظيف الوصف من النص الزائد
        if (channelInfo.description) {
            channelInfo.description = channelInfo.description.replace("...more", "").trim();
        }
        
        res.json(channelInfo);

    } catch (error) {
        console.error("Channel Info Error:", error);
        res.status(500).json({ 
            error: "حدث خطأ أثناء استخراج بيانات القناة",
            details: error.message 
        });
    }
});

// ============ مسار استخراج فيديوهات القناة فقط ============
app.get('/api/channel/videos', async (req, res) => {
    const channelUrl = req.query.url;
    
    if (!channelUrl) {
        return res.json({ 
            error: "الرجاء إدخال رابط القناة",
            example: "/api/channel/videos?url=https://www.youtube.com/@IShowSpeed/videos"
        });
    }

    try {
        const response = await fetch(channelUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const html = await response.text();
        
        // استخراج ytInitialData
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        if (!match || !match[1]) {
            return res.json({ error: "لم يتم العثور على بيانات الفيديوهات" });
        }

        const jsonData = JSON.parse(match[1]);
        let videos = [];
        let videoDetails = {};

        // أولاً: جمع كل التفاصيل من العناصر
        function collectVideoDetails(obj) {
            if (Array.isArray(obj)) {
                obj.forEach(collectVideoDetails);
            } else if (obj !== null && typeof obj === 'object') {
                
                // جمع تفاصيل الفيديو من lockupViewModel
                if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
                    const lockup = obj.lockupViewModel;
                    const videoId = lockup.contentId;
                    
                    // التحقق من أن هذا فيديو (وليس قناة أو قائمة تشغيل)
                    const isVideo = lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage?.ytThumbnailBottomOverlayViewModel !== undefined;
                    
                    if (isVideo && videoId.length === 11) {
                        if (!videoDetails[videoId]) {
                            videoDetails[videoId] = {
                                id: videoId,
                                title: "",
                                thumbnail: "",
                                views: "",
                                published_at: "",
                                duration: ""
                            };
                        }
                        
                        // استخراج العنوان
                        const titleObj = lockup.metadata?.lockupMetadataViewModel?.ytLockupMetadataViewModelHost?.ytLockupMetadataViewModelTextContainer?.ytLockupMetadataViewModelHeadingReset;
                        if (titleObj) {
                            // البحث عن العنوان في كائنات مختلفة
                            if (titleObj.ytLockupMetadataViewModelTitle) {
                                const titleData = titleObj.ytLockupMetadataViewModelTitle;
                                if (titleData.content) {
                                    videoDetails[videoId].title = titleData.content;
                                } else if (titleData.runs && Array.isArray(titleData.runs)) {
                                    videoDetails[videoId].title = titleData.runs.map(r => r.text || "").join("");
                                }
                            } else if (titleObj.title) {
                                videoDetails[videoId].title = titleObj.title;
                            } else if (titleObj.ariaLabel) {
                                // إزالة المدة من نهاية العنوان
                                videoDetails[videoId].title = titleObj.ariaLabel.replace(/\s+\d+\s+(hour|minute|second)s?.*$/i, "");
                            }
                        }
                        
                        // استخراج الصورة المصغرة
                        const thumbObj = lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage;
                        if (thumbObj?.ytCoreImageHost?.src) {
                            videoDetails[videoId].thumbnail = thumbObj.ytCoreImageHost.src;
                        }
                        
                        // استخراج المدة
                        const durationObj = thumbObj?.ytThumbnailBottomOverlayViewModel?.ytThumbnailBottomOverlayViewModelHost?.ytThumbnailBottomOverlayViewModelBadgeContainer?.ytThumbnailBadgeViewModel?.ytThumbnailBadgeViewModelHost?.badgeShape?.ytBadgeShapeHost?.ytBadgeShapeText;
                        if (durationObj) {
                            videoDetails[videoId].duration = durationObj;
                        }
                        
                        // استخراج المشاهدات وتاريخ النشر
                        const metadataContainer = lockup.metadata?.lockupMetadataViewModel?.ytLockupMetadataViewModelHost?.ytLockupMetadataViewModelTextContainer?.ytLockupMetadataViewModelMetadata;
                        
                        if (metadataContainer?.ytContentMetadataViewModel?.ytContentMetadataViewModelHost) {
                            const metadataHost = metadataContainer.ytContentMetadataViewModel.ytContentMetadataViewModelHost;
                            
                            // جمع كل النصوص
                            const texts = [];
                            if (metadataHost.ytContentMetadataViewModelMetadataRow) {
                                metadataHost.ytContentMetadataViewModelMetadataRow.forEach(row => {
                                    const textObj = row.ytAttributedStringHost;
                                    if (textObj?.content) {
                                        texts.push(textObj.content);
                                    } else if (textObj?.runs) {
                                        texts.push(textObj.runs.map(r => r.text || "").join(""));
                                    }
                                });
                            }
                            
                            // أيضًا النص المسطح
                            if (metadataHost.ytContentMetadataViewModelMetadataText) {
                                const textObj = metadataHost.ytContentMetadataViewModelMetadataText;
                                if (textObj.content) {
                                    texts.push(textObj.content);
                                } else if (textObj.runs) {
                                    texts.push(textObj.runs.map(r => r.text || "").join(""));
                                }
                            }
                            
                            if (texts.length >= 1) videoDetails[videoId].views = texts[0];
                            if (texts.length >= 2) videoDetails[videoId].published_at = texts[1];
                        }
                    }
                }
                
                Object.values(obj).forEach(collectVideoDetails);
            }
        }
        
        collectVideoDetails(jsonData);
        
        // تحويل الكائن إلى مصفوفة
        videos = Object.values(videoDetails);
        
        // ترتيب الفيديوهات حسب الترتيب الذي ظهرت به
        videos.sort((a, b) => {
            const orderA = Object.keys(videoDetails).indexOf(a.id);
            const orderB = Object.keys(videoDetails).indexOf(b.id);
            return orderA - orderB;
        });
        
        // إزالة الفيديوهات المكررة
        const uniqueVideos = Array.from(new Map(videos.map(video => [video.id, video])).values());
        
        // أخذ أول 30 فيديو
        const recentVideos = uniqueVideos.slice(0, 30);
        
        // تنسيق الروابط
        const finalVideos = recentVideos.map(video => ({
            ...video,
            video_url: `https://www.youtube.com/watch?v=${video.id}`,
            thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
        }));
        
        res.json({
            total_videos: finalVideos.length,
            videos: finalVideos
        });

    } catch (error) {
        console.error("Channel Videos Error:", error);
        res.status(500).json({ 
            error: "حدث خطأ أثناء استخراج فيديوهات القناة",
            details: error.message 
        });
    }
});















// إعداد مسار الـ API
app.get('/api/extract', async (req, res) => {
    const videoUrl = req.query.url; 
    
    if (!videoUrl) {
        return res.json(DEFAULT_RESPONSE); 
    }

    const apiUrl = "https://api.vidssave.com/api/contentsite_api/media/parse";
    const formData = new URLSearchParams();
    
    formData.append("link", videoUrl); 
    formData.append("auth", "20250901majwlqo"); 
    formData.append("domain", "api-ak.vidssave.com");
    formData.append("origin", "source");

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Origin": "https://ar.vidssave.com",
                "Referer": "https://ar.vidssave.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            body: formData
        });
        
        const rawData = await response.json();
        
        // ترتيب البيانات في الهيكل الثابت
        let formattedData = parseAndFormatData(rawData);
        
        // فحص الروابط بالتوازي للتأكد من أنها تعمل
        const finalResult = {
            id: formattedData.id,
            title: formattedData.title,
            img: formattedData.img,
            quality_144P: await checkUrlIsAlive(formattedData.quality_144P),
            quality_360P: await checkUrlIsAlive(formattedData.quality_360P),
            quality_720P: await checkUrlIsAlive(formattedData.quality_720P),
            quality_1080P: await checkUrlIsAlive(formattedData.quality_1080P),
            quality_MP3: await checkUrlIsAlive(formattedData.quality_MP3)
        };
        
        // إرجاع النتيجة
        res.json([finalResult]); 

    } catch (error) {
        console.error("Fetch Error:", error);
        res.json(DEFAULT_RESPONSE);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
