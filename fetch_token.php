<?php
function get_token() {
    $url = "https://www.korax90.co/matches-yesterday"; // المصدر الذي يحتوي على الرابط
    $html = file_get_contents($url); // ملاحظة: قد تحتاج لاستخدام cURL مع User-Agent إذا تم حظر file_get_contents
    
    // البحث عن الـ security_token داخل كود الصفحة باستخدام Regex
    preg_match('/security_token=([a-zA-Z0-9]+)/', $html, $matches);
    
    return isset($matches[1]) ? $matches[1] : '9eb1d4e57c'; // إرجاع الـ token أو القيمة الافتراضية
}
?>