const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// قائمة مصادر DaddyLive
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

// الهيدرز الافتراضية للتشغيل السلس
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_REFERER = "https://daddylive.mov/";

// دالة صياغة هيكل القناة بالظبط كما طلبت
function formatChannelItem(item) {
    const channelName = (item.title || item.name || "").trim();
    
    // تجميع كافة روابط السيرفرات المتوفرة (url, url1, url2...)
    let rawLinks = [];
    if (item.url) rawLinks.push(item.url);

    Object.keys(item).forEach(key => {
        if (key.startsWith('url') && key !== 'url' && item[key]) {
            rawLinks.push(item[key]);
        }
    });

    // بناء قائمة المصادر (sources)
    const sources = rawLinks.map((link, index) => ({
        quality: `سيرفر ${index + 1}`,
        url: link,
        headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            "Referer": DEFAULT_REFERER
        }
    }));

    // الهيكل الثابت والمطلوب
    return {
        success: true,
        channel: {
            id: String(item.id || `live_tv_${channelName.toLowerCase().replace(/[^a-z0-9]/g, '')}`),
            name: channelName,
            logo: item.logo || item.image || item.icon || ""
        },
        total_sources: sources.length,
        sources: sources
    };
}

// دالة جلب البيانات المباشرة بالتوازي
async function fetchLiveChannels() {
    let rawChannels = [];

    const requests = sourceUrls.map(url => 
        axios.get(url, { timeout: 8000 }).catch(err => {
            console.error(`خطأ في جلب: ${url}`, err.message);
            return null;
        })
    );

    const responses = await Promise.all(requests);

    responses.forEach(response => {
        if (response && Array.isArray(response.data)) {
            response.data.forEach(item => {
                const name = item.title || item.name;
                if (!name || name.includes("Channel not listed")) return;
                rawChannels.push(item);
            });
        }
    });

    // إزالة القنوات المكررة بناءً على الاسم
    const uniqueMap = new Map();
    rawChannels.forEach(item => {
        const name = (item.title || item.name).trim();
        if (!uniqueMap.has(name)) {
            uniqueMap.set(name, item);
        }
    });

    // تحويل كافة القنوات للهيكل المطلوب وتنسيقها
    const formattedChannels = Array.from(uniqueMap.values()).map(formatChannelItem);
    return formattedChannels.sort((a, b) => a.channel.name.localeCompare(b.channel.name));
}

// ---------------------- API Endpoints ---------------------- //

// 1. طلب القنوات حسب الحرف (مثال: /api/channels/A أو /api/channels/0-9)
app.get('/api/channels/:letter', async (req, res) => {
    try {
        const letter = req.params.letter.toUpperCase();
        const allChannels = await fetchLiveChannels();

        const filteredChannels = allChannels.filter(item => {
            const firstLetter = item.channel.name.trim().charAt(0).toUpperCase();
            if (letter === '0-9') {
                return !/^[A-Z]$/.test(firstLetter);
            }
            return firstLetter === letter;
        });

        res.json(filteredChannels);
    } catch (error) {
        res.status(500).json([]);
    }
});

// 2. البحث المباشر باسم القناة (مثال: /api/search/bein)
app.get('/api/search/:name', async (req, res) => {
    try {
        const query = req.params.name.trim().toLowerCase();
        const allChannels = await fetchLiveChannels();

        const results = allChannels.filter(item => 
            item.channel.name.toLowerCase().includes(query)
        );

        res.json(results);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API Running on port ${PORT}`);
});
