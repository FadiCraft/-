// 1. الحصول على الرابط من شريط العنوان مثلاً: yoursite.com/?page=https://website.com
const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('page');

if (targetUrl) {
    // استخدمنا بروكسي لتفادي مشكلة CORS التي تمنع جلب بيانات من موقع آخر
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    fetch(proxyUrl)
        .then(response => {
            if (response.ok) return response.json();
            throw new Error('Network response was not ok.');
        })
        .then(data => {
            // 2. تحويل النص البرمجي المسترجع إلى عناصر HTML يمكن قراءتها
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.contents, 'text/html');

            // 3. البحث عن كل العناصر التي تحمل كلاس postDiv
            const posts = doc.querySelectorAll('.postDiv');
            const extractedData = [];

            posts.forEach(post => {
                // استخراج الرابط
                const link = post.querySelector('a') ? post.querySelector('a').href : null;
                
                // استخراج رابط الصورة
                const img = post.querySelector('.imgdiv-class img');
                const imgSrc = img ? (img.getAttribute('data-src') || img.src) : null;
                
                // استخراج العنوان
                const title = post.querySelector('.h1') ? post.querySelector('.h1').textContent.trim() : null;
                
                // استخراج الجودة
                const quality = post.querySelector('.quality') ? post.querySelector('.quality').textContent.trim() : null;
                
                // استخراج المشاهدات
                const views = post.querySelector('.pViews') ? post.querySelector('.pViews').textContent.trim() : null;
                
                // استخراج التصنيفات (الأقسام) لأنها أكثر من عنصر
                const categories = [];
                post.querySelectorAll('.cat').forEach(cat => {
                    categories.push(cat.textContent.trim());
                });

                // تجميع البيانات في كائن (Object)
                extractedData.push({
                    title: title,
                    link: link,
                    image: imgSrc,
                    quality: quality,
                    categories: categories,
                    views: views
                });
            });

            // 4. طباعة النتيجة النهائية كـ JSON
            console.log("البيانات المستخرجة:", extractedData);
            
            // يمكنك هنا عرضها في صفحتك بدلاً من طباعتها في الكونسول
            // document.body.innerText = JSON.stringify(extractedData, null, 2);
        })
        .catch(error => console.error('حدث خطأ أثناء جلب البيانات:', error));
} else {
    console.log("لم يتم تمرير رابط في المتغير ?page=");
}
