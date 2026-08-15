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











// مسار استخراج بيانات القناة وفيديوهاتها - نسخة محسنة
app.get('/api/channel', async (req, res) => {
    const channelUrl = req.query.url;
    
    if (!channelUrl) {
        return res.json({ 
            error: "الرجاء إدخال رابط القناة",
            example: "/api/channel?url=https://www.youtube.com/@IShowSpeed/videos"
        });
    }

    try {
        const response = await fetch(channelUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        
        // استخراج بيانات ytInitialData
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        if (!match || !match[1]) {
            return res.json({ error: "لم يتم العثور على بيانات القناة" });
        }

        const jsonData = JSON.parse(match[1]);
        
        // استخراج معلومات القناة
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

        // استخراج فيديوهات القناة
        let videos = [];

        // دالة مساعدة لاستخراج النص من عناصر مختلفة
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

        // دالة البحث العميق في البيانات - نسخة محسنة
        function searchDeep(obj, path = "") {
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => searchDeep(item, `${path}[${index}]`));
            } else if (obj !== null && typeof obj === 'object') {
                
                // ========== استخراج معلومات القناة ==========
                
                // البحث عن عناصر header الخاصة بالقناة
                if (path.includes("pageHeader") || path.includes("header")) {
                    
                    // استخراج الاسم (النمط الجديد)
                    if (obj.dynamicTextViewModelH1 && !channelInfo.name) {
                        const h1Text = extractText(obj.dynamicTextViewModelH1.ytAttributedStringHost || obj.dynamicTextViewModelH1);
                        if (h1Text) channelInfo.name = h1Text;
                        
                        // التحقق من التوثيق
                        if (obj.dynamicTextViewModelH1.ariaLabel && obj.dynamicTextViewModelH1.ariaLabel.includes("Verified")) {
                            channelInfo.verified = true;
                        }
                    }
                    
                    // استخراج الاسم (نمط آخر)
                    if (obj.ytPageHeaderViewModelTitle && !channelInfo.name) {
                        const titleObj = obj.ytPageHeaderViewModelTitle;
                        if (titleObj.ytDynamicTextViewModel) {
                            const text = extractText(titleObj.ytDynamicTextViewModel.dynamicTextViewModelH1 || titleObj.ytDynamicTextViewModel);
                            if (text) channelInfo.name = text;
                        }
                    }
                    
                    // استخراج الصورة الرمزية
                    if (!channelInfo.avatar) {
                        // البحث عن صور avatar
                        if (obj.ytSpecAvatarShapeAvatarSizeGiant) {
                            const avatarImg = obj.ytSpecAvatarShapeAvatarSizeGiant.ytCoreImageHost || obj.ytSpecAvatarShapeAvatarSizeGiant.img;
                            if (avatarImg && avatarImg.src) {
                                channelInfo.avatar = avatarImg.src;
                            }
                        }
                        
                        // نمط آخر للصورة
                        if (obj.ytDecoratedAvatarViewModel) {
                            const avatarObj = obj.ytDecoratedAvatarViewModel;
                            if (avatarObj.avatar?.avatarViewModel?.image?.sources?.[0]?.url) {
                                channelInfo.avatar = avatarObj.avatar.avatarViewModel.image.sources[0].url;
                            }
                        }
                    }
                    
                    // استخراج النصوص الوصفية (المشتركين، عدد الفيديوهات، المقبض)
                    if (obj.ytContentMetadataViewModel || obj.ytContentMetadataViewModelHost) {
                        const metadataObj = obj.ytContentMetadataViewModel || obj.ytContentMetadataViewModelHost;
                        
                        // البحث في الصفوف
                        if (metadataObj.ytContentMetadataViewModelMetadataRow || metadataObj.metadataRows) {
                            const rows = metadataObj.ytContentMetadataViewModelMetadataRow || metadataObj.metadataRows || [];
                            
                            if (Array.isArray(rows)) {
                                rows.forEach(row => {
                                    const text = extractText(row.ytAttributedStringHost || row);
                                    
                                    if (text.startsWith("@") && !channelInfo.handle) {
                                        channelInfo.handle = text;
                                    } else if (text.includes("subscriber") && !channelInfo.subscribers) {
                                        channelInfo.subscribers = text;
                                    } else if (text.includes("video") && !channelInfo.videos_count) {
                                        channelInfo.videos_count = text;
                                    }
                                });
                            }
                        }
                        
                        // البحث في النمط المسطح
                        if (metadataObj.ytContentMetadataViewModelMetadataText) {
                            const text = extractText(metadataObj.ytContentMetadataViewModelMetadataText);
                            if (text.startsWith("@") && !channelInfo.handle) {
                                channelInfo.handle = text;
                            } else if (text.includes("subscriber") && !channelInfo.subscribers) {
                                channelInfo.subscribers = text;
                            } else if (text.includes("video") && !channelInfo.videos_count) {
                                channelInfo.videos_count = text;
                            }
                        }
                    }
                    
                    // استخراج الوصف
                    if (obj.ytDescriptionPreviewViewModel || obj.ytDescriptionPreviewViewModelHost) {
                        const descObj = obj.ytDescriptionPreviewViewModel || obj.ytDescriptionPreviewViewModelHost;
                        const descText = extractText(descObj.truncatedText?.truncatedTextContent?.ytAttributedStringHost || descObj);
                        if (descText && descText !== "...more") {
                            channelInfo.description = descText.replace("...more", "").trim();
                        }
                    }
                    
                    // استخراج الروابط الاجتماعية
                    if (obj.ytAttributionViewModel || obj.ytAttributionViewModelHost) {
                        const attrObj = obj.ytAttributionViewModel || obj.ytAttributionViewModelHost;
                        const attrText = extractText(attrObj.ytAttributedStringHost || attrObj);
                        
                        if (attrText && attrText.includes("http") && channelInfo.social_links.length < 10) {
                            const linkMatch = attrText.match(/https?:\/\/[^\s]+/);
                            if (linkMatch) {
                                channelInfo.social_links.push({
                                    platform: attrText.split(" ")[0] || "Link",
                                    url: linkMatch[0]
                                });
                            }
                        }
                    }
                }
                
                // ========== استخراج الفيديوهات ==========
                
                // النمط القديم: videoRenderer
                if (obj.videoRenderer && obj.videoRenderer.videoId) {
                    const video = obj.videoRenderer;
                    videos.push({
                        id: video.videoId,
                        title: extractText(video.title),
                        video_url: `https://www.youtube.com/watch?v=${video.videoId}`,
                        thumbnail: video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || 
                                  video.thumbnail?.thumbnails?.[0]?.url || "",
                        views: extractText(video.viewCountText) || extractText(video.shortViewCountText),
                        published_at: extractText(video.publishedTimeText),
                        duration: extractText(video.lengthText),
                        description: video.descriptionSnippet ? extractText(video.descriptionSnippet) : ""
                    });
                }
                
                // النمط الجديد: lockupViewModel مع contentId
                if (obj.lockupViewModel && obj.lockupViewModel.contentId && obj.lockupViewModel.contentId.length === 11) {
                    const lockup = obj.lockupViewModel;
                    const videoId = lockup.contentId;
                    
                    // التحقق من وجود صورة مصغرة (للتأكد أنه فيديو)
                    let hasThumbnail = false;
                    let thumbnail = "";
                    
                    // البحث عن الصورة المصغرة
                    if (lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage) {
                        const thumbObj = lockup.contentImage.thumbnailViewModel.thumbnailViewModelImage.ytThumbnailViewModelImage;
                        thumbnail = thumbObj.ytCoreImageHost?.src || thumbObj.img?.src || "";
                        hasThumbnail = !!thumbnail;
                    }
                    
                    if (hasThumbnail) {
                        // استخراج العنوان
                        let title = "";
                        const metadataContainer = lockup.metadata?.lockupMetadataViewModel?.ytLockupMetadataViewModelHost?.ytLockupMetadataViewModelTextContainer;
                        
                        if (metadataContainer?.ytLockupMetadataViewModelHeadingReset) {
                            const headingObj = metadataContainer.ytLockupMetadataViewModelHeadingReset;
                            title = extractText(headingObj.ytLockupMetadataViewModelTitle || headingObj);
                            
                            // إذا لم يتم العثور على العنوان، حاول من الخصائص الأخرى
                            if (!title) {
                                title = headingObj.title || headingObj.ariaLabel?.split(" 1 hour")[0]?.split(" 1 minute")[0] || "";
                            }
                        }
                        
                        // استخراج مدة الفيديو
                        let duration = "";
                        const badgeObj = lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage?.ytThumbnailBottomOverlayViewModel?.ytThumbnailBottomOverlayViewModelHost;
                        
                        if (badgeObj?.ytThumbnailBottomOverlayViewModelBadgeContainer?.ytThumbnailBadgeViewModel?.ytThumbnailBadgeViewModelHost?.badgeShape?.ytBadgeShapeHost?.ytBadgeShapeText) {
                            duration = badgeObj.ytThumbnailBottomOverlayViewModelBadgeContainer.ytThumbnailBadgeViewModel.ytThumbnailBadgeViewModelHost.badgeShape.ytBadgeShapeHost.ytBadgeShapeText;
                        }
                        
                        // استخراج المشاهدات وتاريخ النشر
                        let views = "";
                        let publishedAt = "";
                        
                        if (metadataContainer?.ytLockupMetadataViewModelMetadata?.ytContentMetadataViewModel?.ytContentMetadataViewModelHost) {
                            const metadataHost = metadataContainer.ytLockupMetadataViewModelMetadata.ytContentMetadataViewModel.ytContentMetadataViewModelHost;
                            
                            // النمط المسطح
                            if (metadataHost.ytContentMetadataViewModelMetadataText) {
                                const text = extractText(metadataHost.ytContentMetadataViewModelMetadataText);
                                if (text.includes("views") || text.includes("watching")) {
                                    views = text;
                                } else {
                                    publishedAt = text;
                                }
                            }
                            
                            // النمط مع الصفوف
                            if (metadataHost.ytContentMetadataViewModelMetadataRow && Array.isArray(metadataHost.ytContentMetadataViewModelMetadataRow)) {
                                const texts = metadataHost.ytContentMetadataViewModelMetadataRow
                                    .map(row => extractText(row.ytAttributedStringHost || row))
                                    .filter(text => text !== "");
                                
                                if (texts.length >= 1) views = texts[0];
                                if (texts.length >= 2) publishedAt = texts[1];
                            }
                        }
                        
                        // إضافة الفيديو إذا كان يحتوي على معرف وعنوان
                        if (videoId && title && !videos.some(v => v.id === videoId)) {
                            videos.push({
                                id: videoId,
                                title: title,
                                video_url: `https://www.youtube.com/watch?v=${videoId}`,
                                thumbnail: thumbnail,
                                views: views,
                                published_at: publishedAt,
                                duration: duration
                            });
                        }
                    }
                }
                
                // البحث في العناصر الفرعية
                Object.entries(obj).forEach(([key, value]) => {
                    searchDeep(value, `${path}.${key}`);
                });
            }
        }

        // بدء البحث العميق
        searchDeep(jsonData);
        
        // ========== طريقة بديلة لاستخراج الفيديوهات إذا لم تنجح الطريقة الأولى ==========
        if (videos.length === 0) {
            // البحث عن ytInitialPlayerResponse أو أي بيانات أخرى
            const playerMatch = html.match(/var ytInitialPlayerResponse = (.*?);<\/script>/);
            if (playerMatch && playerMatch[1]) {
                const playerData = JSON.parse(playerMatch[1]);
                // يمكن استخراج بعض المعلومات من هنا إذا لزم الأمر
            }
            
            // البحث في html مباشرة عن روابط الفيديو
            const videoMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
            if (videoMatches) {
                const uniqueIds = [...new Set(videoMatches.map(match => match.split('v=')[1]))];
                
                // استخراج العناوين من html
                uniqueIds.slice(0, 30).forEach(videoId => {
                    const titleMatch = html.match(new RegExp(`"videoId":"${videoId}".*?"title":{"runs":\\[{"text":"([^"]+)"`, 's'));
                    const title = titleMatch ? titleMatch[1] : "";
                    
                    videos.push({
                        id: videoId,
                        title: title || `Video ${videoId}`,
                        video_url: `https://www.youtube.com/watch?v=${videoId}`,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        views: "",
                        published_at: "",
                        duration: ""
                    });
                });
            }
        }
        
        // إزالة الفيديوهات المكررة
        const uniqueVideos = Array.from(new Map(videos.map(video => [video.id, video])).values());
        
        // أخذ آخر 30 فيديو
        const recentVideos = uniqueVideos.slice(0, 30);
        
        // تنسيق النتيجة النهائية
        const result = {
            channel: {
                ...channelInfo,
                url: channelUrl,
                total_videos_extracted: recentVideos.length
            },
            videos: recentVideos
        };
        
        // إضافة معلومات إضافية إذا كانت القناة فارغة
        if (!result.channel.name && !result.channel.handle) {
            // استخراج اسم القناة من الرابط
            const handleMatch = channelUrl.match(/@([^\/]+)/);
            if (handleMatch) {
                result.channel.handle = `@${handleMatch[1]}`;
                result.channel.name = handleMatch[1];
            }
        }
        
        res.json(result);

    } catch (error) {
        console.error("Channel Extraction Error:", error);
        res.status(500).json({ 
            error: "حدث خطأ أثناء استخراج بيانات القناة",
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
