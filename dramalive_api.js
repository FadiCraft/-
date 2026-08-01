const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

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

function encryptAES(data) {
  const encrypted = CryptoJS.AES.encrypt(data, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return encrypted.toString() + ":" + CryptoJS.enc.Base64.stringify(IV);
}

app.get("/", async (req, res) => {
  // مصفوفة لجمع السجلات
  let logs = [];
  
  try {
    // الخطوة 1: تجهيز البيانات
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
      "appCount": "{}",
      "mainServer": "http://main.backendcoreapi.com/api/live/livedrama/v13.0.0/",
      "type": "tv",
      "topic": "arabic_sport"
    };
    
    logs.push("✅ 1. تجهيز البيانات");
    
    // الخطوة 2: تشفير البيانات
    const jsonData = JSON.stringify(postData);
    logs.push("✅ 2. تحويل البيانات إلى JSON");
    
    const encryptedBody = encryptAES(jsonData);
    logs.push("✅ 3. تشفير البيانات");
    logs.push("📝 البيانات المشفرة (أول 100 حرف): " + encryptedBody.substring(0, 100));
    
    // الخطوة 3: إرسال الطلب
    logs.push("✅ 4. إرسال الطلب إلى السيرفر...");
    
    const response = await axios.post(
      "http://live.1spbgmu.com/api/live/livedrama/v13.0.0/getLiveByTopic",
      encryptedBody,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)",
          "Host": "live.1spbgmu.com",
          "Connection": "Keep-Alive",
          "Accept-Encoding": "gzip"
        },
        timeout: 30000
      }
    );
    
    logs.push("✅ 5. تم استلام الرد");
    logs.push("📝 Status: " + response.status);
    logs.push("📝 الرد الخام (أول 200 حرف): " + response.data.substring(0, 200));
    logs.push("📝 نوع الرد: " + typeof response.data);
    logs.push("📝 طول الرد: " + response.data.length);
    
    // التحقق إذا كان الرد HTML
    if (response.data.includes("<html") || response.data.includes("<!DOCTYPE")) {
      logs.push("❌ الرد HTML وليس نص مشفر!");
      return res.json({
        error: "HTML Response",
        logs: logs,
        htmlPreview: response.data.substring(0, 500)
      });
    }
    
    // الخطوة 4: فك التشفير
    logs.push("✅ 6. فك التشفير...");
    const decryptedResponse = decryptAES(response.data);
    logs.push("✅ 7. تم فك التشفير");
    logs.push("📝 النص المفكوك (أول 200 حرف): " + decryptedResponse.substring(0, 200));
    
    // الخطوة 5: تحويل إلى JSON
    const jsonResponse = JSON.parse(decryptedResponse);
    logs.push("✅ 8. تم تحويل إلى JSON");
    
    res.json({
      success: true,
      logs: logs,
      data: jsonResponse
    });
    
  } catch (error) {
    logs.push("❌ خطأ: " + error.message);
    logs.push("❌ نوع الخطأ: " + error.name);
    
    if (error.response) {
      logs.push("📝 خطأ في الرد - Status: " + error.response.status);
      logs.push("📝 رد الخطأ: " + JSON.stringify(error.response.data).substring(0, 200));
    }
    
    res.json({ 
      error: "Failed",
      message: error.message,
      logs: logs
    });
  }
});

app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
