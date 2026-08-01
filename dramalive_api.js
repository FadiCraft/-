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
  try {
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
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
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
        timeout: 30000,
        responseType: 'text' // تأكد من استلام النص كما هو
      }
    );
    
    const decryptedResponse = decryptAES(response.data);
    if (decryptedResponse) {
      const jsonResponse = JSON.parse(decryptedResponse);
      res.json(jsonResponse);
    } else {
      res.json({ error: true, message: "فشل في فك التشفير" });
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    res.json({ error: true, message: error.message });
  }
});

// مسار البث - مع إصلاحات
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
    
    console.log("Sending data:", JSON.stringify(postData, null, 2));
    
    const encryptedBody = encryptAES(JSON.stringify(postData));
    console.log("Encrypted body length:", encryptedBody.length);
    
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
        responseType: 'text',
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 500; // قبول كل الردود ما عدا أخطاء السيرفر
        }
      }
    );
    
    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers);
    console.log("Response data preview:", response.data.substring(0, 100));
    
    // إذا كان الرد يحتوي على نص مشفر، أرسله كما هو
    if (response.data && response.data.includes(':')) {
      res.type("text/plain").send(response.data);
    } else {
      // إذا كان الرد JSON خطأ، حاول فك تشفيره
      const decrypted = decryptAES(response.data);
      if (decrypted) {
        try {
          res.json(JSON.parse(decrypted));
        } catch {
          res.type("text/plain").send(response.data);
        }
      } else {
        res.type("text/plain").send(response.data);
      }
    }
    
  } catch (error) {
    console.error("Stream Error:", error.message);
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
    }
    res.json({ error: true, message: error.message });
  }
});

// مسار لفك تشفير النص المستلم
app.get("/decrypt", async (req, res) => {
  try {
    const encryptedText = req.query.data;
    
    if (!encryptedText) {
      return res.json({ error: true, message: "يرجى إدخال النص المشفر" });
    }
    
    const decrypted = decryptAES(encryptedText);
    if (decrypted) {
      try {
        res.json(JSON.parse(decrypted));
      } catch {
        res.type("text/plain").send(decrypted);
      }
    } else {
      res.json({ error: true, message: "فشل في فك التشفير" });
    }
  } catch (error) {
    res.json({ error: true, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
  console.log("Endpoints:");
  console.log("GET / - القنوات الرئيسية");
  console.log("GET /stream?id_live=XXX - البث المباشر");
  console.log("GET /decrypt?data=XXX - فك التشفير");
});
