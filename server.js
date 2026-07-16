import json
import requests
from bs4 import BeautifulSoup

# الرابط المراد كشطه
url = "https://topcinma.com/movies/"

# إرسال كود الـ User-Agent لتبدو الزيارة وكأنها من متصفح حقيقي لتجنب الحظر
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
}


def scrape_movies(target_url):
    try:
        # إرسال طلب للموقع
        response = requests.get(target_url, headers=headers)
        response.raise_for_status()  # التأكد من أن الطلب تم بنجاح

        # تحليل محتوى الصفحة
        soup = BeautifulSoup(response.content, "html.parser")

        # البحث عن جميع الصناديق الخاصة بالأفلام بناءً على الكلاس الذي أرفقته
        movie_boxes = soup.find_all("div", class_="Small--Box")

        movies_list = []

        for box in movie_boxes:
            # 1. استخراج الرابط الأساسي للفيلم
            a_tag = box.find("a", class_="recent--block")
            movie_url = a_tag["href"] if a_tag else None

            # 2. استخراج العنوان
            title_tag = box.find("h3", class_="title")
            title = title_tag.text.strip() if title_tag else None

            # 3. استخراج رابط بوستر الفيلم (الصورة)
            poster_div = box.find("div", class_="Poster")
            img_tag = poster_div.find("img") if poster_div else None
            image_url = img_tag["src"] if img_tag else None

            # 4. استخراج تفاصيل القائمة (النوع، الجودة، التقييم)
            ul_list = box.find("ul", class_="liList")
            genres = []
            quality = None
            imdb_rating = None

            if ul_list:
                li_tags = ul_list.find_all("li")

                for li in li_tags:
                    # التحقق إذا كان العنصر يحتوي على كلاس التقييم
                    if "imdbRating" in li.get("class", []):
                        imdb_rating = (
                            li.text.strip()
                        )  # سيستخرج التقييم مثل: 4.9
                    else:
                        text = li.text.strip()
                        # تمييز الجودة عن التصنيف (إذا كان النص يحتوي على p أو WEB أو BluRay إلخ فهو جودة)
                        if any(
                            q in text.lower()
                            for q in ["p", "web", "bluray", "hd", "cam"]
                        ):
                            quality = text
                        else:
                            genres.append(text)  # إضافة التصنيف مثل (دراما)

            # تجميع البيانات بشكل مرتب في قاموس (Dictionary)
            movie_data = {
                "title": title,
                "url": movie_url,
                "poster_image": image_url,
                "genres": genres,
                "quality": quality,
                "imdb_rating": imdb_rating,
            }

            movies_list.append(movie_data)

        return movies_list

    except Exception as e:
        print(f"حدث خطأ أثناء استخراج البيانات: {e}")
        return []


# تشغيل الكود وطباعة النتيجة بشكل مرتب جداً (JSON)
if __name__ == "__main__":
    print("جاري استخراج البيانات من الموقع... برجاء الانتظار")
    results = scrape_movies(url)

    # طباعة النتيجة بتنسيق JSON مقروء ومنظم لدعم اللغة العربية
    print(json.dumps(results, ensure_ascii=False, indent=4))
