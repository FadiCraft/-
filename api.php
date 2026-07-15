<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

function fetch_url($url) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Accept-Language: ar,en;q=0.9',
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['error' => $error];
    }
    
    if ($httpCode !== 200) {
        return ['error' => "HTTP Error: $httpCode"];
    }
    
    return ['data' => $response, 'code' => $httpCode];
}

// استخراج security_token من صفحة المصدر
function get_security_token() {
    // محاولة من موقع korax90.co
    $result = fetch_url('https://www.korax90.co/matches-yesterday');
    
    if (isset($result['data'])) {
        preg_match('/security_token=([a-zA-Z0-9]+)/', $result['data'], $matches);
        if (isset($matches[1])) {
            return $matches[1];
        }
    }
    
    // محاولة بديلة من shootwithyalla مباشرة
    $result2 = fetch_url('https://cup.shootwithyalla.com/');
    if (isset($result2['data'])) {
        preg_match('/security_token["\']?\s*[:=]\s*["\']([a-zA-Z0-9]+)["\']/', $result2['data'], $matches2);
        if (isset($matches2[1])) {
            return $matches2[1];
        }
    }
    
    // قيمة افتراضية
    return '9eb1d4e57c';
}

// جلب بيانات المباريات
$token = get_security_token();
$apiUrl = "https://cup.shootwithyalla.com/?action=get_matches&lang=ar&security_token=" . $token;

$result = fetch_url($apiUrl);

if (isset($result['error'])) {
    echo json_encode([
        'error' => $result['error'],
        'token_used' => $token
    ]);
    exit;
}

// تمرير البيانات كما هي
echo $result['data'];
?>