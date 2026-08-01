const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

function encryptAES(data) {
  const encrypted = CryptoJS.AES.encrypt(data, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return encrypted.toString() + ":" + CryptoJS.enc.Base64.stringify(IV);
}

function decryptAES(encryptedText) {
  encryptedText = encryptedText.trim();
  const lastColon = encryptedText.lastIndexOf(":");
  const encryptedData = encryptedText.substring(0, lastColon);
  const ivBase64 = encryptedText.substring(lastColon + 1);
  
  const decrypted = CryptoJS.AES.decrypt(encryptedData, KEY, {
    iv: CryptoJS.enc.Base64.parse(ivBase64),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// الصفحة الرئيسية
app.get("/", async (req, res) => {
  try {
    const postData = {
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
      "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
      "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
      "type": "tv",
      "topic": "arabic_sport"
    };
    
    const encryptedBody = encryptAES(JSON.stringify(postData));
    
    const response = await axios.post(
      "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic",
      encryptedBody,
      {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com",
          "Connection": "Keep-Alive",
          "Accept-Encoding": "gzip",
          "Accept": "*/*",
          "Accept-Language": "ar",
          "X-Requested-With": "XMLHttpRequest"
        },
        timeout: 30000
      }
    );
    
    const decryptedResponse = decryptAES(response.data);
    const jsonResponse = JSON.parse(decryptedResponse);
    
    res.json(jsonResponse);
    
  } catch (error) {
    res.json({ error: true, message: error.message });
  }
});






// مسار البث - مع فك التشفير
app.get("/stream", async (req, res) => {
  try {
    const id_live = req.query.id_live;
    
    if (!id_live) {
      return res.json({ error: true, message: "يرجى إدخال id_live" });
    }
    
    const postData = {
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
      "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
      "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
      "type": "tv",
      "id_live": id_live,
      "id": id_live,
      "live_id": id_live,
      "channel_id": id_live
    };
    
    const encryptedBody = encryptAES(JSON.stringify(postData));
    
    const response = await axios.post(
      "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById",
      encryptedBody,
      {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com",
          "Connection": "Keep-Alive"
        },
        timeout: 30000,
        responseType: "arraybuffer" 
      }
    );
    
    const rawBuffer = Buffer.from(response.data);
    const rawText = rawBuffer.toString("utf-8");
    const cleanEncryptedText = rawText.trim();
    
    if (rawBuffer.length < 50) {
      return res.json({
        error: true,
        message: "السيرفر رفض الطلب وأرجع رداً قصيراً",
        length: rawBuffer.length,
        raw_text: rawText,
        status: response.status
      });
    }
    
    // --- عملية فك التشفير ---
    const decryptedResponse = decryptAES(cleanEncryptedText);
    
    // محاولة تحويل النص المفكوك إلى JSON للرد كـ API منظم
    try {
      const jsonResponse = JSON.parse(decryptedResponse);
      res.json(jsonResponse);
    } catch (parseError) {
      // في حال كان الرد مفكوكاً لكنه ليس بصيغة JSON
      res.json({
        error: true,
        message: "تم فك التشفير بنجاح ولكن النص ليس JSON صالحاً",
        decrypted_text: decryptedResponse
      });
    }
    
  } catch (error) {
    res.json({ 
      error: true, 
      message: error.message,
      details: error.response ? Buffer.from(error.response.data).toString("utf-8") : "No response data"
    });
  }
});

















app.get("/live", (req, res) => {
  const url = req.query.u; // الرابط (يجب أن يكون رابط m3u8 مباشر)
  
  if (!url) {
    return res.status(400).send("يرجى إرسال رابط البث عبر المعامل u");
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>مشغل البث</title>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <style>
            body { margin:0; background:#000; }
            #video { width:100%; height:100vh; }
        </style>
    </head>
    <body>
        <video id="video" controls autoplay></video>
        <script>
            var video = document.getElementById('video');
            var videoSrc = '${url}';
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(videoSrc);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play(); });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = videoSrc;
            }
        </script>
    </body>
    </html>
  `;

  res.send(htmlContent);
});










// مسار لاختبار الروابط المخفية للأقسام
app.get("/explore", async (req, res) => {
  try {
    // يمكنك تمرير اسم الرابط المراد اختباره عبر مسار الرابط
    // مثال: /explore?endpoint=getLiveCategories
    const endpointName = req.query.endpoint || "getLiveCategories"; 
    
    const postData = {
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
      "appCount": "{\"adsFailed\":122,\"adsLoaded\":76,\"adsShowed\":29,\"runCount\":12}",
      "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
      "type": "tv"
      // لاحظ أننا أزلنا "topic" هنا لنرى إن كان السيرفر سيرد بكل البيانات
    };
    
    const encryptedBody = encryptAES(JSON.stringify(postData));
    
    const response = await axios.post(
      `http://live.1spbgmu.com/api/live/livedrama/v13.0.0/${endpointName}`,
      encryptedBody,
      {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com",
          "Connection": "Keep-Alive"
        },
        timeout: 10000,
        responseType: "arraybuffer" 
      }
    );
    
    const rawBuffer = Buffer.from(response.data);
    const rawText = rawBuffer.toString("utf-8");
    const cleanEncryptedText = rawText.trim();
    
    const decryptedResponse = decryptAES(cleanEncryptedText);
    
    try {
      res.json(JSON.parse(decryptedResponse));
    } catch (e) {
      res.send(decryptedResponse);
    }
    
  } catch (error) {
    res.json({ error: true, endpoint_tested: req.query.endpoint, message: "هذا الرابط غير موجود أو السيرفر رفض الطلب" });
  }
});




app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
