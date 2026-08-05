const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// تفعيل CORS لتمكين الاستدعاء من التطبيقات ومواقع الويب
app.use(cors());
app.use(express.json());

// منفذ السيرفر (يقبل منفذ Render التلقائي أو 3000 محلياً)
const PORT = process.env.PORT || 3000;

const sourceUrls = [
    "https://daddylive.mov/cache/channels.json?v=1785871295137&r=0.817095409251016",
    "https://daddylive.mov/player/player5.json?v=1785871295137",
    "https://daddylive.mov/player/player10.json?v=1785871295137",
    "https://daddylive.mov/player/player14.json?v=1785871295138",
    "https://daddylive.mov/player/player6.json?v=1785871295138",
    "https://daddylive.mov/player/player2.json?v=1785871295139",
    "https://daddylive.mov/player/player9.json?v=1785871295139",
    "https://daddylive.mov/player/player11.json?v=1785871295139"
];

// تخزين البيانات مؤقتاً في الذاكرة للوصول السريع
let channelsCache = {
    all: [],
    byLetter: {}
};
let isScraping = false;
let lastUpdated = null;

async function scrapeChannels() {
    if (isScraping) return;
    isScraping = true;
    console.log("🔄 جاري جلب البيانات وتحديث قائمة القنوات...");

    let allProcessedChannels = [];

    for (const url of sourceUrls) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            const data = response.data;

            if (Array.isArray(data)) {
                data.forEach(item => {
                    const channelName = item.title || item.name;
                    if (!channelName || channelName.includes("Channel not listed")) return;

                    let servers = [];

                    if (item.url) {
                        servers.push({ name: "Main Server", link: item.url });
                    }

                    Object.keys(item).forEach(key => {
                        if (key.startsWith('url') && item[key]) {
                            servers.push({ name: key.toUpperCase(), link: item[key] });
                        }
                    });

                    allProcessedChannels.push({
                        id: item.id || null,
                        name: channelName.trim(),
                        servers: servers
                    });
                });
            }
        } catch (error) {
            console.error(`❌ خطأ في جلب الرابط ${url}:`, error.message);
        }
    }

    // إزالة القنوات المكررة
    const uniqueChannels = Array.from(new Map(allProcessedChannels.map(c => [c.name, c])).values());

    const mainDir = path.join(__dirname, 'chann');
    if (!fs.existsSync(mainDir)) {
        fs.mkdirSync(mainDir, { recursive: true });
    }

    const channelsByLetter = {};

    uniqueChannels.forEach(channel => {
        const firstLetter = channel.name.trim().charAt(0).toUpperCase();
        let key = /^[A-Z]$/.test(firstLetter) ? firstLetter : '0-9';

        if (!channelsByLetter[key]) {
            channelsByLetter[key] = [];
        }
        channelsByLetter[key].push(channel);
    });

    // حفظ الملفات محلياً مع ترتيبها
    for (const [key, channels] of Object.entries(channelsByLetter)) {
        channels.sort((a, b) => a.name.localeCompare(b.name));
        const fileName = `${key}.json`;
        const filePath = path.join(mainDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(channels, null, 4), 'utf-8');
    }

    // تحديث الذاكرة المؤقتة (Cache)
    channelsCache.all = uniqueChannels.sort((a, b) => a.name.localeCompare(b.name));
    channelsCache.byLetter = channelsByLetter;
    lastUpdated = new Date().toISOString();
    isScraping = false;

    console.log(`✅ تم تحديث القنوات بنجاح! إجمالي القنوات: ${uniqueChannels.length}`);
}

// ---------------------- API Endpoints ---------------------- //

// 1. الصفحة الرئيسية والتحقق من حالة السيرفر
app.get('/', (req, res) => {
    res.json({
        status: "online",
        totalChannels: channelsCache.all.length,
        lastUpdated: lastUpdated,
        endpoints: {
            allChannels: "/api/channels",
            byLetter: "/api/channels/:letter (مثال: /api/channels/A أو /api/channels/0-9)",
            refresh: "/api/refresh"
        }
    });
});

// 2. الحصول على كل القنوات
app.get('/api/channels', (req, res) => {
    res.json({
        count: channelsCache.all.length,
        lastUpdated: lastUpdated,
        channels: channelsCache.all
    });
});

// 3. الحصول على قنوات حرف معين (A, B, C... أو 0-9)
app.get('/api/channels/:letter', (req, res) => {
    const letter = req.params.letter.toUpperCase();
    const channels = channelsCache.byLetter[letter] || [];
    
    res.json({
        letter: letter,
        count: channels.length,
        channels: channels
    });
});

// 4. إجبار السيرفر على إعادة سحب البيانات فوراً
app.get('/api/refresh', async (req, res) => {
    await scrapeChannels();
    res.json({
        message: "تم تحديث البيانات بنجاح",
        lastUpdated: lastUpdated,
        totalChannels: channelsCache.all.length
    });
});

// تشغيل السيرفر وجلب البيانات لأول مرة
app.listen(PORT, async () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    await scrapeChannels();
});
