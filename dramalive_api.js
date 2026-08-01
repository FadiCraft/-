const express = require("express");
const axios = require("axios");
const CryptoJS = require("crypto-js");

const app = express();
const PORT = process.env.PORT || 3000;

// الثوابت كما هي
const KEY = CryptoJS.enc.Utf8.parse("0123456789abcdef");
const IV = CryptoJS.enc.Utf8.parse("fedcba9876543210");

function encryptAES(data) {
  const encrypted = CryptoJS.AES.encrypt(data, KEY, {
    iv: IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  const combined = IV.concat(encrypted.ciphertext);
  return combined.toString(CryptoJS.enc.Base64);
}

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
    
    // الحل النهائي للتشخيص: أرسل لنا الرد كما هو بالضبط
    res.json({
      status: response.status,
      rawData: response.data,
      dataType: typeof response.data
    });
    
  } catch (error) {
    res.json({ 
        error: true, 
        message: error.message,
        response: error.response ? error.response.data : "لا يوجد رد"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server ready on port " + PORT);
});
