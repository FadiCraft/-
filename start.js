const express = require('express');
const app = express();

// استدعاء تطبيقاتك الثلاثة
const topcinmaApp = require('./topcinma');
const yacintvApp = require('./dramalive');
const floratvApp = require('./laroza');

// دمجها في سيرفر واحد مع تحديد المسار لكل تطبيق
app.use('/topcinma', topcinmaApp);
app.use('/yacintv', yacintvApp);
app.use('/floratv', floratvApp);

// تشغيل السيرفر الموحد
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر الموحد يعمل بنجاح على البورت ${PORT}`);
});
