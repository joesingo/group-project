<?php

/*
 * Forward a GET request to the address in $_GET["url"], forwarding all other
 * GET parameters passed to this script, and return the recieved response
 */

$url = $_GET["url"] . "/?" . http_build_query($_GET);
$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, getallheaders());

$response = curl_exec($ch);
$status_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
http_response_code($status_code);
echo $response;

?>
