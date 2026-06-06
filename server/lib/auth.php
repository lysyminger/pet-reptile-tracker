<?php
// JWT (HS256) + 微信 jscode2session
declare(strict_types=1);

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
    $r = strlen($data) % 4;
    if ($r) $data .= str_repeat('=', 4 - $r);
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_sign(array $payload): string {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $h = base64url_encode(json_encode($header,  JSON_UNESCAPED_UNICODE));
    $p = base64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = hash_hmac('sha256', $h . '.' . $p, env('JWT_SECRET'), true);
    return $h . '.' . $p . '.' . base64url_encode($sig);
}

function jwt_verify(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', $h . '.' . $p, env('JWT_SECRET'), true));
    if (!hash_equals($expected, $s)) return null;
    $payload = json_decode(base64url_decode($p), true);
    if (!is_array($payload)) return null;
    if (isset($payload['exp']) && $payload['exp'] < time()) return null;
    return $payload;
}

// 从 Authorization 头取 token 并验证；通过返回 openid，失败 401 + exit
function require_auth(): string {
    $hdr = '';
    // PHP 在 Nginx + FPM 下，Authorization 可能在不同地方
    foreach ([
        $_SERVER['HTTP_AUTHORIZATION']            ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION']   ?? null,
        function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? null) : null,
    ] as $v) {
        if ($v) { $hdr = (string)$v; break; }
    }
    if (!preg_match('/^Bearer\s+(.+)$/i', $hdr, $m)) {
        json_error('Unauthorized', 401);
    }
    $payload = jwt_verify(trim($m[1]));
    if (!$payload || empty($payload['openid'])) {
        json_error('Unauthorized', 401);
    }
    return (string)$payload['openid'];
}

// 用 wx.login 的 code 调微信换 openid
function wx_jscode2session(string $code): array {
    $url = 'https://api.weixin.qq.com/sns/jscode2session?'
        . http_build_query([
            'appid'      => env('WX_APPID'),
            'secret'     => env('WX_APPSECRET'),
            'js_code'    => $code,
            'grant_type' => 'authorization_code',
        ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($resp === false) {
        json_error('微信接口不可达: ' . $err, 502);
    }
    $data = json_decode($resp, true);
    if (!is_array($data) || empty($data['openid'])) {
        json_error('微信登录失败: ' . ($data['errmsg'] ?? '未知错误'), 401);
    }
    return $data; // 含 openid, session_key, [unionid]
}
