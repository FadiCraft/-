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

        // استخراج اسم القناة والمقبض من الرابط
        const handleMatch = channelUrl.match(/@([^\/]+)/);
        if (handleMatch) {
            channelInfo.handle = `@${handleMatch[1]}`;
            channelInfo.name = handleMatch[1];
        }

        // استخراج البيانات من meta tags
        const metaTitle = html.match(/<meta name="title" content="([^"]+)"/);
        if (metaTitle) {
            const title = metaTitle[1];
            if (title.includes(" - YouTube")) {
                channelInfo.name = title.replace(" - YouTube", "").trim();
            }
        }

        // استخراج الوصف من meta tags
        const metaDescription = html.match(/<meta name="description" content="([^"]+)"/);
        if (metaDescription) {
            channelInfo.description = metaDescription[1];
        }

        // استخراج الصورة الرمزية
        const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (avatarMatch) {
            channelInfo.avatar = avatarMatch[1];
        }

        // استخراج الصورة الرمزية من الطريقة الثانية
        if (!channelInfo.avatar) {
            const avatarMatch2 = html.match(/yt3\.googleusercontent\.com\/[^"']+/);
            if (avatarMatch2) {
                channelInfo.avatar = `https://${avatarMatch2[0]}`;
            }
        }

        // استخراج المشتركين وعدد الفيديوهات
        const subscriberMatch = html.match(/([\d.,]+[KM]?)\s*subscribers/);
        if (subscriberMatch) {
            channelInfo.subscribers = `${subscriberMatch[1]} subscribers`;
        }

        const videosCountMatch = html.match(/([\d.,]+[KM]?)\s*videos/);
        if (videosCountMatch) {
            channelInfo.videos_count = `${videosCountMatch[1]} videos`;
        }

        // التحقق من التوثيق
        if (html.includes('"verified":true') || html.includes('badge-style-type-verified')) {
            channelInfo.verified = true;
        }

        // استخراج الروابط الاجتماعية
        const socialLinks = [];
        const socialMatches = html.match(/https?:\/\/(twitter\.com|x\.com|instagram\.com|facebook\.com|tiktok\.com|twitch\.tv|discord\.gg)[^"'\s\\]+/g);
        if (socialMatches) {
            const uniqueLinks = [...new Set(socialMatches)];
            uniqueLinks.slice(0, 10).forEach(link => {
                const platform = link.includes('twitter') || link.includes('x.com') ? 'Twitter/X' :
                                link.includes('instagram') ? 'Instagram' :
                                link.includes('facebook') ? 'Facebook' :
                                link.includes('tiktok') ? 'TikTok' :
                                link.includes('twitch') ? 'Twitch' :
                                link.includes('discord') ? 'Discord' : 'Social';
                socialLinks.push({
                    platform: platform,
                    url: link
                });
            });
        }
        channelInfo.social_links = socialLinks;

        // البحث في ytInitialData للحصول على معلومات إضافية
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        if (match && match[1]) {
            try {
                const jsonData = JSON.parse(match[1]);
                const jsonStr = JSON.stringify(jsonData);
                
                // استخراج المشتركين من البيانات المنظمة
                const subMatch = jsonStr.match(/"content":"([\d.,]+[KM]? subscribers)"/);
                if (subMatch && !channelInfo.subscribers) {
                    channelInfo.subscribers = subMatch[1];
                }
                
                // استخراج عدد الفيديوهات من البيانات المنظمة
                const vidCountMatch = jsonStr.match(/"content":"([\d.,]+[KM]? videos)"/);
                if (vidCountMatch && !channelInfo.videos_count) {
                    channelInfo.videos_count = vidCountMatch[1];
                }
                
                // استخراج الصورة الرمزية من البيانات المنظمة
                if (!channelInfo.avatar) {
                    const avatarFromJson = jsonStr.match(/"url":"(https:\/\/yt3\.googleusercontent\.com\/[^"]+)"/);
                    if (avatarFromJson) {
                        channelInfo.avatar = avatarFromJson[1];
                    }
                }
                
            } catch (error) {
                console.error("Error parsing ytInitialData for channel info:", error);
            }
        }

        // تنظيف البيانات
        if (channelInfo.name && channelInfo.name.includes("@")) {
            const nameMatch = channelInfo.name.match(/@([^ ]+)/);
            if (nameMatch) {
                channelInfo.handle = `@${nameMatch[1]}`;
                channelInfo.name = nameMatch[1];
            }
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
        let videos = [];

        // الطريقة 1: استخراج من ytInitialData
        const match = html.match(/var ytInitialData = (.*?);<\/script>/);
        if (match && match[1]) {
            try {
                const jsonData = JSON.parse(match[1]);
                
                // البحث العميق عن الفيديوهات
                function findVideos(obj, depth = 0) {
                    if (depth > 20) return; // منع التكرار اللانهائي
                    
                    if (Array.isArray(obj)) {
                        obj.forEach(item => findVideos(item, depth + 1));
                    } else if (obj !== null && typeof obj === 'object') {
                        
                        // البحث عن videoId
                        if (obj.videoId && typeof obj.videoId === 'string' && obj.videoId.length === 11) {
                            const videoId = obj.videoId;
                            
                            // البحث عن العنوان في نفس الكائن أو الكائنات المجاورة
                            let title = "";
                            if (obj.title) {
                                if (typeof obj.title === 'string') {
                                    title = obj.title;
                                } else if (obj.title.runs && Array.isArray(obj.title.runs)) {
                                    title = obj.title.runs.map(r => r.text || "").join("");
                                } else if (obj.title.simpleText) {
                                    title = obj.title.simpleText;
                                }
                            }
                            
                            // البحث عن الصورة المصغرة
                            let thumbnail = "";
                            if (obj.thumbnail?.thumbnails) {
                                thumbnail = obj.thumbnail.thumbnails[obj.thumbnail.thumbnails.length - 1]?.url || "";
                            }
                            
                            // البحث عن المشاهدات
                            let views = "";
                            if (obj.viewCountText) {
                                if (typeof obj.viewCountText === 'string') {
                                    views = obj.viewCountText;
                                } else if (obj.viewCountText.simpleText) {
                                    views = obj.viewCountText.simpleText;
                                }
                            } else if (obj.shortViewCountText?.simpleText) {
                                views = obj.shortViewCountText.simpleText;
                            }
                            
                            // البحث عن تاريخ النشر
                            let publishedAt = "";
                            if (obj.publishedTimeText?.simpleText) {
                                publishedAt = obj.publishedTimeText.simpleText;
                            }
                            
                            // البحث عن المدة
                            let duration = "";
                            if (obj.lengthText?.simpleText) {
                                duration = obj.lengthText.simpleText;
                            }
                            
                            // إضافة الفيديو إذا لم يكن موجودًا
                            if (!videos.some(v => v.id === videoId)) {
                                videos.push({
                                    id: videoId,
                                    title: title || "",
                                    video_url: `https://www.youtube.com/watch?v=${videoId}`,
                                    thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                                    views: views,
                                    published_at: publishedAt,
                                    duration: duration
                                });
                            }
                        }
                        
                        // البحث في العناصر الفرعية
                        Object.values(obj).forEach(value => findVideos(value, depth + 1));
                    }
                }
                
                findVideos(jsonData);
                
            } catch (error) {
                console.error("Error parsing ytInitialData for videos:", error);
            }
        }

        // الطريقة 2: إذا لم يتم العثور على فيديوهات، استخرج من HTML مباشرة
        if (videos.length === 0) {
            // استخراج معرفات الفيديو من HTML
            const videoIdMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
            if (videoIdMatches) {
                const uniqueIds = [...new Set(videoIdMatches.map(match => {
                    const id = match.match(/v=([a-zA-Z0-9_-]{11})/);
                    return id ? id[1] : null;
                }).filter(Boolean))];
                
                // استخراج العناوين من ytInitialPlayerResponse أو من HTML
                uniqueIds.slice(0, 30).forEach(videoId => {
                    videos.push({
                        id: videoId,
                        title: "",
                        video_url: `https://www.youtube.com/watch?v=${videoId}`,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        views: "",
                        published_at: "",
                        duration: ""
                    });
                });
            }
        }

        // إزالة الفيديوهات المكررة والاحتفاظ بأول 30
        const uniqueVideos = Array.from(new Map(videos.map(video => [video.id, video])).values());
        const recentVideos = uniqueVideos.slice(0, 30);
        
        // تنظيف العناوين الفارغة
        const finalVideos = recentVideos.filter(video => {
            // إزالة الفيديوهات التي تحتوي على عنوان "الانضمام إلى عضوية"
            return !video.title.includes("الانضمام إلى عضوية") && 
                   !video.title.includes("Join this channel");
        });

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
