const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

// تهيئة السيرفر
const app = express();
app.use(cors()); // السماح بالاتصال من أي تطبيق أو متصفح
app.use(express.json()); // لدعم استقبال البيانات بصيغة JSON

// إعدادات التشفير المستخرجة من التطبيق
const KEY = "0123456789abcdef";
const IV = "fedcba9876543210";
const ALGORITHM = "aes-128-cbc";

// دالة التشفير
function encrypt(text) {
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY, 'latin1'), Buffer.from(IV, 'latin1'));
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // إضافة الـ IV بعد النقطتين كما يفعل التطبيق
    const ivBase64 = Buffer.from(IV, 'latin1').toString('base64');
    return `${encrypted}:${ivBase64}`;
}

// مسار الـ API الخاص بجلب روابط البث (يدعم الآن GET ليفتح في المتصفح مباشرة)
app.all('/api/get-stream', async (req, res) => {
    const targetUrl = "http://redirect.1spbgmu.com/redirect/getLiveByRedirect";

    // استخراج الـ id سواء جاء من الرابط مباشرة عبر المتصفح أو من طلب مخصص
    const channelId = req.query.id || req.body.id || "live_tv_beinsport1max";

    // البيانات التي سيتم إرسالها
    const payload = {
        "user_id": "_19449_1785337989457_notloggedin.com_dramalive3",
        "device_id": "dde6f748-9857-4140-b133-4ccfaeb015fe",
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
        "appCount": "{\"adsFailed\":119,\"adsLoaded\":72,\"adsShowed\":27,\"runCount\":11}",
        "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
        "id": channelId, // القناة المطلوبة ديناميكياً
        "url": "http://.LS.V2live_tv_custom_handler_live_tv_beinsportnews_description_DL_/s",
        "agent": "redirect"
    };

    try {
        // 1. تشفير البيانات
        const encryptedPayload = encrypt(JSON.stringify(payload));
        
        // 2. إرسال الطلب للسيرفر مع الهيدرز المطابقة للتطبيق
        const response = await axios.post(targetUrl, encryptedPayload, {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
                "Host": "redirect.1spbgmu.com",
                "Connection": "Keep-Alive",
                "Accept-Encoding": "gzip"
            }
        });

        // 3. إرسال النتيجة المستلمة لتظهر كـ JSON في المتصفح أو التطبيق
        res.json(response.data);

    } catch (error) {
        console.error("خطأ في جلب البيانات:", error.message);
        res.status(500).json({ error: "فشل في الاتصال بسيرفر البث", details: error.message });
    }
});

// مسار رئيسي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.send("السيرفر يعمل بنجاح! يمكنك الآن تجربة الرابط: /api/get-stream");
});

// تحديد البورت (Render سيقوم بوضع البورت الخاص به أوتوماتيكياً)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
