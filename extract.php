<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$pageUrl = $_GET['url'] ?? '';

if (empty($pageUrl)) {
    echo json_encode(['error' => 'No URL provided']);
    exit;
}

function fetch_url($url, $headers = []) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['error' => $error];
    }
    
    return ['data' => $response, 'code' => $httpCode];
}

// جلب صفحة albaplayer
$result = fetch_url($pageUrl, [
    'Referer: https://cup.shootwithyalla.com/',
    'Origin: https://cup.shootwithyalla.com',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
]);

if (isset($result['error'])) {
    echo json_encode(['error' => $result['error']]);
    exit;
}

$html = $result['data'];

// محاولة استخراج رابط m3u8 من الصفحة
$m3u8Patterns = [
    // أنماط مختلفة لروابط m3u8
    '/(?:source|src|file|url)\s*[=:]\s*["\']([^"\']*\.m3u8[^"\']*)/i',
    '/(https?:\/\/[^\s"\'<>]+\.m3u8[^\s"\'<>]*)/i',
    '/["\'](https?:\/\/[^"\']*\.m3u8[^"\']*)["\']/i',
    '/(\/\/[^\s"\'<>]+\.m3u8[^\s"\'<>]*)/i',
    '/source:\s*["\']([^"\']*\.m3u8[^"\']*)/i',
    '/file:\s*["\']([^"\']*\.m3u8[^"\']*)/i',
];

$m3u8Url = '';

foreach ($m3u8Patterns as $pattern) {
    if (preg_match($pattern, $html, $matches)) {
        $m3u8Url = $matches[1];
        break;
    }
}

// إذا ما لقينا m3u8، حاول نبحث عن iframe
if (empty($m3u8Url)) {
    preg_match('/<iframe[^>]+src=["\']([^"\']+)["\']/i', $html, $iframeMatches);
    
    if (isset($iframeMatches[1])) {
        $iframeUrl = $iframeMatches[1];
        
        // جلب صفحة iframe
        $iframeResult = fetch_url($iframeUrl, [
            'Referer: ' . $pageUrl,
            'Origin: https://cup.shootwithyalla.com',
        ]);
        
        if (isset($iframeResult['data'])) {
            foreach ($m3u8Patterns as $pattern) {
                if (preg_match($pattern, $iframeResult['data'], $matches)) {
                    $m3u8Url = $matches[1];
                    break;
                }
            }
        }
    }
}

// تنظيف الرابط
if (!empty($m3u8Url)) {
    // إضافة http: إذا كان الرابط يبدأ بـ //
    if (strpos($m3u8Url, '//') === 0) {
        $m3u8Url = 'https:' . $m3u8Url;
    }
    
    echo json_encode([
        'success' => true,
        'm3u8_url' => $m3u8Url
    ]);
} else {
    echo json_encode([
        'error' => 'لم يتم العثور على رابط m3u8 في الصفحة',
        'page_url' => $pageUrl
    ]);
}
?>