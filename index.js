const express = require('express');
const { exec } = require('child_process');
const app = express();
// هذا السطر ضروري جداً ليعمل على Render لأن المنصة تحدد البورت تلقائياً
const PORT = process.env.PORT || 3000;

app.get('/video-info', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "الرجاء إرسال رابط صحيح" });

    // الأمر هنا مجهز ليتعامل مع الكوكيز ويحدد بيئة تشغيل الـ JS
    // تأكد أن ملف cookies.txt موجود في نفس المجلد
    const command = `./yt-dlp --js-runtimes node --cookies cookies.txt -j --skip-download "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ 
                error: "فشل استخراج البيانات (قد يكون بسبب انتهاء صلاحية الكوكيز)", 
                details: stderr 
            });
        }

        try {
            const data = JSON.parse(stdout);

            // تجهيز صيغ الفيديو
            const uniqueFormats = [];
            const seen = new Set();
            const allFormats = data.formats.filter(f => f.url && !f.format_id.startsWith('sb'));

            for (const f of allFormats) {
                const resKey = f.resolution || "audio";
                if (!seen.has(resKey)) {
                    uniqueFormats.push({
                        resolution: resKey,
                        ext: f.ext,
                        url: f.url
                    });
                    seen.add(resKey);
                }
            }

            // إرسال البيانات كاملة
            res.json({
                title: data.title,
                description: data.description,
                thumbnail: data.thumbnail,
                duration: data.duration_string,
                view_count: data.view_count,
                like_count: data.like_count,
                channel_name: data.uploader,
                channel_url: data.uploader_url,
                channel_thumbnail: data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[0].url : null, 
                subscriber_count: data.channel_follower_count,
                formats: uniqueFormats
            });
        } catch (e) {
            res.status(500).json({ error: "خطأ في المعالجة", details: e.message });
        }
    });
});

app.listen(PORT, () => console.log(`السيرفر يعمل الآن على البورت: ${PORT}`));
