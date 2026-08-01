const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// مفتاح و IV ثابتين
const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

// دالة فك التشفير
function decryptAES(encryptedText) {
  try {
    // تنظيف النص من المسافات والسطور الجديدة
    encryptedText = encryptedText.trim();
    
    // البحث عن آخر ":" لفصل الـ IV
    const lastColonIndex = encryptedText.lastIndexOf(":");
    if (lastColonIndex === -1) {
      throw new Error("Invalid format: no colon found");
    }
    
    const encryptedData = encryptedText.substring(0, lastColonIndex);
    const ivBase64 = encryptedText.substring(lastColonIndex + 1);
    
    // فك التشفير
    const decrypted = CryptoJS.AES.decrypt(encryptedData, KEY, {
      iv: CryptoJS.enc.Base64.parse(ivBase64),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!result) {
      throw new Error("Decryption returned empty result");
    }
    
    return result;
  } catch (error) {
    console.error("Decryption error:", error.message);
    throw error;
  }
}

// دالة تشفير البيانات
function encryptAES(data) {
  const encrypted = CryptoJS.AES.encrypt(data, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  const ivBase64 = CryptoJS.enc.Base64.stringify(IV);
  return encrypted.toString() + ":" + ivBase64;
}

// الصفحة الرئيسية - ترجع JSON مباشر
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
    
    // تشفير البيانات
    const encryptedBody = encryptAES(JSON.stringify(postData));
    
    console.log("Sending request to server...");
    
    // إرسال الطلب للسيرفر
    const response = await axios.post(
      "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic",
      encryptedBody,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com"
        },
        timeout: 30000
      }
    );
    
    console.log("Response received, decrypting...");
    console.log("Raw response:", response.data.substring(0, 100) + "...");
    
    // فك تشفير الرد
    const decryptedResponse = decryptAES(response.data);
    
    console.log("Decrypted successfully");
    
    // تحويل إلى JSON
    const jsonResponse = JSON.parse(decryptedResponse);
    
    // عرض JSON مباشر
    res.json(jsonResponse);
    
  } catch (error) {
    console.error("Error:", error.message);
    res.json({ 
      error: "Failed",
      message: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
