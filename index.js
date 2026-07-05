const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;

app.get('/video-info', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "الرجاء إرسال رابط صحيح" });

    // أمر جلب البيانات
    const command = `./yt-dlp -j --skip-download "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: "فشل استخراج البيانات", details: stderr });
        }

        try {
            const data = JSON.parse(stdout);

            // فلترة وتجهيز البيانات المطلوبة
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

            // إرسال البيانات كاملة مع الوصف
            res.json({
                title: data.title,
                description: data.description, // تم إضافة الوصف هنا
                thumbnail: data.thumbnail,
                duration: data.duration_string,
                view_count: data.view_count,
                like_count: data.like_count,
                channel_name: data.uploader,
                channel_url: data.uploader_url,
                // محاولة لجلب صورة القناة، إذا لم تكن موجودة سيعيد null بدلاً من N/A
                channel_thumbnail: data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[0].url : null, 
                subscriber_count: data.channel_follower_count,
                formats: uniqueFormats
            });
        } catch (e) {
            res.status(500).json({ error: "خطأ في المعالجة", details: e.message });
        }
    });
});

app.listen(PORT, () => console.log(`السيرفر يعمل على: http://localhost:${PORT}`));
