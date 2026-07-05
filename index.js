const url = "https://api.vidssave.com/api/contentsite_api/media/parse";

// تجهيز البيانات المرسلة
const formData = new URLSearchParams();
formData.append("link", "https://www.youtube.com/watch?v=wJKXnjGUJto"); // يمكنك تغيير الرابط هنا لأي فيديو آخر
formData.append("auth", "20250901majwlqo"); // تم تحديث الرمز هنا
formData.append("domain", "api-ak.vidssave.com");
formData.append("origin", "source");

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://ar.vidssave.com",
    "Referer": "https://ar.vidssave.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  },
  body: formData
})
.then(response => response.json())
.then(data => {
  // استخدام JSON.stringify لفك طي الكائنات المتداخلة وعرض روابط التحميل بوضوح
  console.log("بيانات الفيديو وروابط التحميل:");
  console.log(JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error("حدث خطأ أثناء الطلب:", error);
});
