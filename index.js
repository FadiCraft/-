const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/video-info', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: "الرجاء إرسال رابط صحيح" });

    // قمنا بإضافة User-Agent و Referer للتمويه بأن الطلب قادم من متصفح حقيقي
    // إذا كان لديك بروكسي، أضف --proxy "رابط_البروكسي" قبل --cookies
    const command = `./yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" --referer "https://www.youtube.com/" --cookies cookies.txt -j --skip-download "${videoUrl}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ 
                error: "فشل استخراج البيانات - يوتيوب يحظر السيرفر", 
                details: stderr 
            });
        }

        try {
            const data = JSON.parse(stdout);
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

            res.json({
                title: data.title,
                thumbnail: data.thumbnail,
                duration: data.duration_string,
                channel_name: data.uploader,
                formats: uniqueFormats
            });
        } catch (e) {
            res.status(500).json({ error: "خطأ في المعالجة", details: e.message });
        }
    });
});

app.listen(PORT, () => console.log(`السيرفر يعمل الآن على البورت: ${PORT}`));
