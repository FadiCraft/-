<?php
$url = $_GET['url'] ?? '';
if (empty($url)) exit('No URL');

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Origin: https://cup.shootwithyalla.com",
    "Referer: https://cup.shootwithyalla.com/",
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>