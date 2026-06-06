<?php
declare(strict_types=1);

function auth_login(): void {
    $body = request_body();
    $code = trim($body['code'] ?? '');
    if ($code === '') json_error('缺少 code 参数');

    $session = wx_jscode2session($code);
    $openid  = $session['openid'];

    // 自动创建 user_info 行（如不存在）
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE openid = ?');
    $stmt->execute([$openid]);
    if (!$stmt->fetch()) {
        $now = date('Y-m-d H:i:s');
        $ins = db()->prepare(
            'INSERT INTO user_info (openid, nickname, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
        );
        $ins->execute([$openid, '爬宠爱好者', $now, $now]);
    }

    $token = jwt_sign([
        'openid' => $openid,
        'iat'    => time(),
        'exp'    => time() + 30 * 24 * 3600, // 30 天
    ]);

    json_ok(['token' => $token, 'openid' => $openid]);
}
