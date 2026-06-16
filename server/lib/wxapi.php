<?php
// 微信开放接口封装：access_token 管理 + 内容安全检测
// 这些接口必须服务端调用，前端调不了。详见微信「内容安全」文档。
declare(strict_types=1);

// ---- 简单的 HTTP 工具（curl）----

function wx_http_get(string $url): array {
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
        error_log('[wxapi] GET 失败: ' . $err . ' url=' . $url);
        return [];
    }
    $data = json_decode($resp, true);
    return is_array($data) ? $data : [];
}

function wx_http_post_json(string $url, array $payload): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_POST           => true,
        // JSON_UNESCAPED_UNICODE：中文不转义，微信按 UTF-8 解析
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    ]);
    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        error_log('[wxapi] POST 失败: ' . $err . ' url=' . $url);
        return [];
    }
    $data = json_decode($resp, true);
    return is_array($data) ? $data : [];
}

// ---- access_token（文件缓存，有效期约 7200s）----

function wx_token_cache_path(): string {
    $dir = __DIR__ . '/../cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir . '/access_token.json';
}

// 返回可用的 access_token；失败返回空串（调用方应自行容错）
function wx_access_token(): string {
    $path = wx_token_cache_path();

    // 命中未过期缓存（留 5 分钟余量）
    if (is_file($path)) {
        $cached = json_decode((string)@file_get_contents($path), true);
        if (is_array($cached) && !empty($cached['token']) && ($cached['expires_at'] ?? 0) > time() + 300) {
            return (string)$cached['token'];
        }
    }

    $url = 'https://api.weixin.qq.com/cgi-bin/token?'
        . http_build_query([
            'grant_type' => 'client_credential',
            'appid'      => env('WX_APPID'),
            'secret'     => env('WX_APPSECRET'),
        ]);
    $data = wx_http_get($url);

    if (empty($data['access_token'])) {
        error_log('[wxapi] 获取 access_token 失败: ' . json_encode($data, JSON_UNESCAPED_UNICODE));
        return '';
    }

    $token   = (string)$data['access_token'];
    $expires = isset($data['expires_in']) ? (int)$data['expires_in'] : 7200;
    @file_put_contents($path, json_encode([
        'token'      => $token,
        'expires_at' => time() + $expires,
    ]), LOCK_EX);
    @chmod($path, 0600);

    return $token;
}

// ---- 内容安全：图片/音频异步检测 ----
// 提交成功返回 trace_id（用于匹配后续推送结果），失败返回 null。
// scene: 1 资料 2 评论 3 论坛 4 社交日志
function wx_media_check_async(string $mediaUrl, string $openid, int $scene = 1): ?string {
    $token = wx_access_token();
    if ($token === '') return null;

    $url  = 'https://api.weixin.qq.com/wxa/media_check_async?access_token=' . urlencode($token);
    $data = wx_http_post_json($url, [
        'media_url'  => $mediaUrl,
        'media_type' => 2,        // 2 图片
        'version'    => 2,
        'scene'      => $scene,
        'openid'     => $openid,
    ]);

    if (($data['errcode'] ?? -1) !== 0 || empty($data['trace_id'])) {
        error_log('[wxapi] media_check_async 失败: ' . json_encode($data, JSON_UNESCAPED_UNICODE) . ' url=' . $mediaUrl);
        return null;
    }
    return (string)$data['trace_id'];
}

// ---- 内容安全：文本同步检测（昵称/宠物名等，留待后续接入）----
// 返回 true=安全可放行，false=违规应拦截。接口/网络异常时放行（fail-open）并记日志。
function wx_msg_sec_check(string $content, string $openid, int $scene = 1): bool {
    $content = trim($content);
    if ($content === '') return true;

    $token = wx_access_token();
    if ($token === '') return true; // 拿不到 token 不阻断正常用户

    $url  = 'https://api.weixin.qq.com/wxa/msg_sec_check?access_token=' . urlencode($token);
    $data = wx_http_post_json($url, [
        'content' => $content,
        'version' => 2,
        'scene'   => $scene,
        'openid'  => $openid,
    ]);

    $errcode = $data['errcode'] ?? -1;
    if ($errcode !== 0) {
        error_log('[wxapi] msg_sec_check 调用异常: ' . json_encode($data, JSON_UNESCAPED_UNICODE));
        return true; // 接口异常放行
    }
    $suggest = $data['result']['suggest'] ?? 'pass';
    return $suggest !== 'risky';
}
