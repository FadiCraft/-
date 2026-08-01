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




// مسار البث - مع محاكاة دقيقة واستلام البيانات الخام (Bytes)
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
      "id_live": id_live
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
          // تم إزالة Accept-Encoding يدوياً لترك Axios يتعامل مع فك الضغط بأمان
        },
        timeout: 30000,
        // هذه الخطوة الأهم: استلام البيانات كبايتات خام لضمان عدم ضياع النص بسبب التشفير
        responseType: "arraybuffer" 
      }
    );
    
    // تحويل البايتات الخام إلى نص بشكل آمن، ثم تنظيف الفراغات
    const rawText = Buffer.from(response.data).toString("utf-8");
    const cleanEncryptedText = rawText.trim();
    
    // في حال كان السيرفر لا يزال يرد بفراغ، سنطبع معلومات تفصيلية لمعرفة السبب
    if (!cleanEncryptedText) {
      return res.json({
        error: true,
        message: "السيرفر أرجع رداً فارغاً",
        status: response.status,
        headers: response.headers
      });
    }
    
    // إرجاع النص المشفر الصافي
    res.type("text/plain").send(cleanEncryptedText);
    
  } catch (error) {
    res.json({ 
      error: true, 
      message: error.message,
      details: error.response ? Buffer.from(error.response.data).toString("utf-8") : "No response data"
    });
  }
});


app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
