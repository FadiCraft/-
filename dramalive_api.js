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




// مسار البث - استخراج النص المشفر الصافي
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
          "Connection": "Keep-Alive",
          "Accept-Encoding": "gzip",
          "Accept": "*/*",
          "Accept-Language": "ar",
          "X-Requested-With": "XMLHttpRequest"
        },
        timeout: 30000,
        // هذه الإضافة تجبر السيرفر على إرجاع النص كما هو دون محاولة تحويله
        responseType: "text" 
      }
    );
    
    // تنظيف النص من أي أسطر فارغة أو مسافات في البداية والنهاية
    const cleanEncryptedText = (response.data || "").toString().trim();
    
    // إرسال النص المشفر الصافي
    res.type("text/plain").send(cleanEncryptedText);
    
  } catch (error) {
    // إرجاع تفاصيل الخطأ في حال رفض السيرفر الطلب
    res.json({ 
      error: true, 
      message: error.message,
      details: error.response ? error.response.data : null 
    });
  }
});



app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
