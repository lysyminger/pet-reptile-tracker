<?php
// 微信「消息推送」回调（明文模式）
//   GET  ：配置 URL 时的校验，校验 signature 后回显 echostr
//   POST ：接收异步检测结果（wxa_media_check），risky 则清除对应头像并删除文件
// 该路由免鉴权（微信服务器直接请求，无 JWT）。
declare(strict_types=1);

// 校验签名：sha1(sort(token, timestamp, nonce))
function wx_check_signature(): bool {
    $token     = env('WX_MSG_TOKEN');
    if ($token === '') { error_log('[wxcallback] 未配置 WX_MSG_TOKEN'); return false; }
    $signature = $_GET['signature'] ?? '';
    $timestamp = $_GET['timestamp'] ?? '';
    $nonce     = $_GET['nonce'] ?? '';
    $arr = [$token, $timestamp, $nonce];
    sort($arr, SORT_STRING);
    return hash_equals(sha1(implode('', $arr)), (string)$signature);
}

function wx_callback(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        // URL 校验
        if (wx_check_signature() && isset($_GET['echostr'])) {
            header('Content-Type: text/plain');
            echo $_GET['echostr'];
        } else {
            http_response_code(403);
            echo 'invalid signature';
        }
        exit;
    }

    // POST：处理推送
    if (!wx_check_signature()) {
        http_response_code(403);
        echo 'invalid signature';
        exit;
    }

    $raw  = file_get_contents('php://input');
    $data = json_decode((string)$raw, true);

    // 微信要求 5 秒内返回 "success"，否则会重试；无论处理结果都先回 success
    if (is_array($data) && (($data['Event'] ?? '') === 'wxa_media_check')) {
        try {
            handle_media_check_result($data);
        } catch (Throwable $e) {
            error_log('[wxcallback] 处理 media_check 失败: ' . $e->getMessage());
        }
    }

    header('Content-Type: text/plain');
    echo 'success';
    exit;
}

function handle_media_check_result(array $data): void {
    $traceId = (string)($data['trace_id'] ?? '');
    if ($traceId === '') return;

    $result  = $data['result'] ?? [];
    $suggest = $result['suggest'] ?? '';
    $label   = isset($result['label']) ? (int)$result['label'] : null;
    // errcode 仅当为 0 时 result 有效；-1008 表示图片下载失败
    $errcode = $data['errcode'] ?? -1;

    // 找到对应的待检记录
    $stmt = db()->prepare('SELECT openid, media_url, status FROM media_check WHERE trace_id = ?');
    $stmt->execute([$traceId]);
    $rec = $stmt->fetch();
    if (!$rec) { error_log('[wxcallback] 未知 trace_id=' . $traceId); return; }

    $openid   = $rec['openid'];
    $mediaUrl = $rec['media_url'];

    $status = ($errcode === 0 && $suggest === 'risky') ? 'risky' : 'pass';

    db()->prepare('UPDATE media_check SET status = ?, label = ?, checked_at = NOW() WHERE trace_id = ?')
        ->execute([$status, $label, $traceId]);

    if ($status !== 'risky') return;

    // 违规：清除使用了该图片的头像，并删除物理文件
    db()->prepare('UPDATE pet_info SET avatar = ? WHERE avatar = ? AND user_openid = ?')
        ->execute(['', $mediaUrl, $openid]);
    db()->prepare('UPDATE user_info SET avatarUrl = ? WHERE avatarUrl = ? AND openid = ?')
        ->execute(['', $mediaUrl, $openid]);

    // 相册：删除引用该图的相册记录（仅限本用户名下的宠物），并删缩略图文件
    $stmt = db()->prepare(
        'SELECT ph._id, ph.thumb_url FROM pet_photos ph JOIN pet_info p ON ph.pet_id = p._id WHERE ph.url = ? AND p.user_openid = ?'
    );
    $stmt->execute([$mediaUrl, $openid]);
    foreach ($stmt->fetchAll() as $photo) {
        db()->prepare('DELETE FROM pet_photos WHERE _id = ?')->execute([$photo['_id']]);
        if (!empty($photo['thumb_url'])) delete_uploaded_file($photo['thumb_url']);
    }

    delete_uploaded_file($mediaUrl);
    error_log('[wxcallback] 已清除违规图片 openid=' . $openid . ' url=' . $mediaUrl . ' label=' . $label);
}

// 根据对外 URL 反推本地文件路径并删除（仅限本服务 uploads 目录内）
function delete_uploaded_file(string $url): void {
    $prefix = rtrim(env('UPLOAD_URL_PREFIX'), '/') . '/';
    if (strncmp($url, $prefix, strlen($prefix)) !== 0) return;
    $name = basename(substr($url, strlen($prefix)));
    if ($name === '' || strpbrk($name, "/\\") !== false) return;
    $path = __DIR__ . '/../uploads/' . $name;
    if (is_file($path)) @unlink($path);
}
