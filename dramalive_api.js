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
          "Accept-Encoding": "gzip"
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

// مسار البث مع تتبع
app.get("/stream", async (req, res) => {
  let log = [];
  
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
    
    log.push("1. تم تجهيز البيانات");
    
    const encryptedBody = encryptAES(JSON.stringify(postData));
    log.push("2. تم تشفير البيانات، الطول: " + encryptedBody.length);
    
    const response = await axios.post(
      "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveAllStreamsById",
      encryptedBody,
      {
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com",
          "Connection": "Keep-Alive",
          "Accept-Encoding": "gzip"
        },
        timeout: 30000
      }
    );
    
    log.push("3. Status: " + response.status);
    log.push("4. طول الرد: " + response.data.length);
    log.push("5. أول 100 حرف: " + response.data.substring(0, 100));
    
    // فك التشفير
    const decryptedResponse = decryptAES(response.data);
    log.push("6. تم فك التشفير");
    log.push("7. النص المفكوك: " + decryptedResponse.substring(0, 200));
    
    // محاولة تحويل إلى JSON
    try {
      const jsonResponse = JSON.parse(decryptedResponse);
      log.push("8. تم تحويل إلى JSON");
      res.json(jsonResponse);
    } catch (parseError) {
      log.push("8. فشل تحويل JSON: " + parseError.message);
      res.json({
        error: true,
        message: "الرد مش JSON صالح",
        log: log,
        rawDecrypted: decryptedResponse
      });
    }
    
  } catch (error) {
    res.json({ 
      error: true, 
      message: error.message,
      log: log
    });
  }
});

app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
