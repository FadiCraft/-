const {join} = require('path');

module.exports = {
  // هذا الكود يجبر المكتبة على تثبيت كروم داخل مجلد المشروع نفسه لكي لا يتم حذفه
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
