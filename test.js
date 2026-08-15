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







// مسار استخراج بيانات القناة وفيديوهاتها
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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
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

        // البحث العميق في البيانات
        function searchChannelData(obj) {
            if (Array.isArray(obj)) {
                obj.forEach(searchChannelData);
            } else if (obj !== null && typeof obj === 'object') {
                
                // استخراج معلومات القناة من pageHeaderViewModel
                if (obj.pageHeaderViewModel || obj.ytPageHeaderViewModel) {
                    const header = obj.pageHeaderViewModel || obj.ytPageHeaderViewModel;
                    
                    // استخراج اسم القناة والمقبض
                    if (header.content?.ytPageHeaderViewModelContent?.ytPageHeaderViewModelHeadline?.ytPageHeaderViewModelHeadlineInfo) {
                        const headlineInfo = header.content.ytPageHeaderViewModelHeadline.ytPageHeaderViewModelHeadlineInfo;
                        
                        // اسم القناة
                        if (headlineInfo.ytPageHeaderViewModelTitle?.ytDynamicTextViewModel?.dynamicTextViewModelH1?.ytAttributedStringHost) {
                            const titleElement = headlineInfo.ytPageHeaderViewModelTitle.ytDynamicTextViewModel.dynamicTextViewModelH1;
                            channelInfo.name = titleElement.ytAttributedStringHost?.content || 
                                              titleElement.ytAttributedStringHost?.runs?.[0]?.text || "";
                            channelInfo.verified = titleElement.ariaLabel?.includes("Verified") || false;
                        }
                        
                        // المقبض والمشتركين وعدد الفيديوهات
                        if (headlineInfo.ytContentMetadataViewModel?.ytContentMetadataViewModelHost?.ytContentMetadataViewModelInline) {
                            const metadata = headlineInfo.ytContentMetadataViewModel.ytContentMetadataViewModelHost.ytContentMetadataViewModelInline;
                            
                            metadata.ytContentMetadataViewModelMetadataRow?.forEach(row => {
                                const textContent = row?.ytAttributedStringHost?.content || 
                                                   row?.ytAttributedStringHost?.runs?.map(run => run.text).join("") || "";
                                
                                if (textContent.startsWith("@")) {
                                    channelInfo.handle = textContent;
                                } else if (textContent.includes("subscribers")) {
                                    channelInfo.subscribers = textContent;
                                } else if (textContent.includes("videos")) {
                                    channelInfo.videos_count = textContent;
                                }
                            });
                        }
                        
                        // وصف القناة
                        if (headlineInfo.ytDescriptionPreviewViewModel?.ytDescriptionPreviewViewModelHost?.truncatedText?.truncatedTextContent?.ytAttributedStringHost) {
                            channelInfo.description = headlineInfo.ytDescriptionPreviewViewModel.ytDescriptionPreviewViewModelHost.truncatedText.truncatedTextContent.ytAttributedStringHost.content || 
                                                     headlineInfo.ytDescriptionPreviewViewModel.ytDescriptionPreviewViewModelHost.truncatedText.truncatedTextContent.ytAttributedStringHost.runs?.map(run => run.text).join("") || "";
                        }
                        
                        // الروابط الاجتماعية
                        if (headlineInfo.ytAttributionViewModel?.ytAttributionViewModelHost?.ytAttributedStringHost) {
                            const attribution = headlineInfo.ytAttributionViewModel.ytAttributionViewModelHost.ytAttributedStringHost;
                            
                            if (attribution.ytAttributedStringLink) {
                                channelInfo.social_links.push({
                                    platform: attribution.ytAttributedStringLink.content || "Social Link",
                                    url: attribution.ytAttributedStringLink.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url || 
                                         attribution.ytAttributedStringLink.runs?.[0]?.navigationEndpoint?.urlEndpoint?.url || ""
                                });
                            }
                        }
                    }
                    
                    // صورة القناة
                    if (header.content?.ytPageHeaderViewModelContent?.ytPageHeaderViewModelHeadline?.ytDecoratedAvatarViewModel?.ytDecoratedAvatarViewModelHost?.ytAvatarShape?.ytSpecAvatarShapeHost?.ytSpecAvatarShapeButton?.ytSpecAvatarShapeButtonGiant) {
                        const avatarElement = header.content.ytPageHeaderViewModelContent.ytPageHeaderViewModelHeadline.ytDecoratedAvatarViewModel.ytDecoratedAvatarViewModelHost.ytAvatarShape.ytSpecAvatarShapeHost.ytSpecAvatarShapeButton.ytSpecAvatarShapeButtonGiant;
                        
                        channelInfo.avatar = avatarElement.ytSpecAvatarShapeAvatarSizeGiant?.ytCoreImageHost?.src || 
                                            avatarElement.ytSpecAvatarShapeAvatarSizeGiant?.img?.src || "";
                    }
                }
                
                // استخراج الفيديوهات من richItemRenderer
                if (obj.richItemRenderer?.content?.videoRenderer) {
                    const video = obj.richItemRenderer.content.videoRenderer;
                    videos.push({
                        id: video.videoId || "",
                        title: video.title?.runs?.[0]?.text || "",
                        video_url: `https://www.youtube.com/watch?v=${video.videoId}`,
                        thumbnail: video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || 
                                  video.thumbnail?.thumbnails?.[0]?.url || "",
                        views: video.viewCountText?.simpleText || "",
                        published_at: video.publishedTimeText?.simpleText || "",
                        duration: video.lengthText?.simpleText || "",
                        description: video.descriptionSnippet?.runs?.map(run => run.text).join("") || ""
                    });
                }
                
                // استخراج الفيديوهات من lockupViewModel (النمط الجديد)
                if (obj.lockupViewModel && obj.lockupViewModel.contentId && obj.lockupViewModel.contentId !== "videoId") {
                    const lockup = obj.lockupViewModel;
                    
                    // التحقق من أن هذا فيديو وليس شيء آخر
                    if (lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage) {
                        const videoId = lockup.contentId;
                        
                        // استخراج العنوان
                        let title = "";
                        if (lockup.metadata?.lockupMetadataViewModel?.ytLockupMetadataViewModelHost?.ytLockupMetadataViewModelTextContainer?.ytLockupMetadataViewModelHeadingReset) {
                            const titleElement = lockup.metadata.lockupMetadataViewModel.ytLockupMetadataViewModelHost.ytLockupMetadataViewModelTextContainer.ytLockupMetadataViewModelHeadingReset;
                            title = titleElement.title || titleElement.ariaLabel?.split(" 1 hour")[0] || "";
                            
                            // إذا كان العنوان موجودًا في الرابط
                            if (!title && titleElement.ytLockupMetadataViewModelTitle) {
                                title = titleElement.ytLockupMetadataViewModelTitle.content || 
                                       titleElement.ytLockupMetadataViewModelTitle.runs?.map(run => run.text).join("") || "";
                            }
                        }
                        
                        // استخراج الصورة المصغرة
                        let thumbnail = "";
                        const thumbnailImage = lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage;
                        if (thumbnailImage) {
                            thumbnail = thumbnailImage.ytCoreImageHost?.src || thumbnailImage.img?.src || "";
                        }
                        
                        // استخراج مدة الفيديو
                        let duration = "";
                        const badgeContainer = lockup.contentImage?.thumbnailViewModel?.thumbnailViewModelImage?.ytThumbnailViewModelImage?.ytThumbnailBottomOverlayViewModel?.ytThumbnailBottomOverlayViewModelHost?.ytThumbnailBottomOverlayViewModelBadgeContainer;
                        if (badgeContainer?.ytThumbnailBadgeViewModel?.ytThumbnailBadgeViewModelHost?.badgeShape?.ytBadgeShapeHost) {
                            duration = badgeContainer.ytThumbnailBadgeViewModel.ytThumbnailBadgeViewModelHost.badgeShape.ytBadgeShapeHost.ytBadgeShapeText || "";
                        }
                        
                        // استخراج المشاهدات وتاريخ النشر
                        let views = "";
                        let publishedAt = "";
                        const metadataRows = lockup.metadata?.lockupMetadataViewModel?.ytLockupMetadataViewModelHost?.ytLockupMetadataViewModelTextContainer?.ytLockupMetadataViewModelMetadata?.ytContentMetadataViewModel?.ytContentMetadataViewModelHost?.ytContentMetadataViewModelMediumText?.ytContentMetadataViewModelMetadataRow;
                        
                        if (metadataRows && Array.isArray(metadataRows)) {
                            const metadataTexts = metadataRows.map(row => 
                                row?.ytAttributedStringHost?.content || 
                                row?.ytAttributedStringHost?.runs?.map(run => run.text).join("") || ""
                            ).filter(text => text !== "");
                            
                            if (metadataTexts.length >= 1) views = metadataTexts[0];
                            if (metadataTexts.length >= 2) publishedAt = metadataTexts[1];
                        }
                        
                        // إضافة الفيديو إذا كان يحتوي على معرف وعنوان
                        if (videoId && title) {
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
                
                Object.values(obj).forEach(searchChannelData);
            }
        }

        searchChannelData(jsonData);
        
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
