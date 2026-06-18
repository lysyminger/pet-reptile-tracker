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

// ============================================================
// 鸿蒙端账号密码登录（与微信登录互不影响 · 纯新增）
// - 微信用户：openid 由微信分配，username/password_hash 保持 NULL，行为不变。
// - 鸿蒙用户：openid 用 hm_ 前缀随机串；也可由绑定工具把账号挂到已有微信 openid 上，实现多端共享数据。
// ============================================================

// 为某个 openid 签发 30 天 token
function issue_token(string $openid): string {
    return jwt_sign([
        'openid' => $openid,
        'iat'    => time(),
        'exp'    => time() + 30 * 24 * 3600,
    ]);
}

// POST /auth/register {username, password, nickname?}
function auth_register(): void {
    $body     = request_body();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $nickname = trim((string)($body['nickname'] ?? ''));

    if ($username === '' || $password === '') json_error('缺少 username 或 password');
    if (mb_strlen($username) > 64)            json_error('用户名过长');
    if (strlen($password) < 6)                json_error('密码至少 6 位');

    // 用户名唯一
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) json_error('用户名已被占用', 409);

    $openid = 'hm_' . bin2hex(random_bytes(13));
    $hash   = password_hash($password, PASSWORD_DEFAULT);
    $now    = date('Y-m-d H:i:s');
    if ($nickname === '') $nickname = $username;

    $ins = db()->prepare(
        'INSERT INTO user_info (openid, username, password_hash, nickname, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([$openid, $username, $hash, $nickname, $now, $now]);

    json_ok(['token' => issue_token($openid), 'openid' => $openid]);
}

// POST /auth/login-app {username, password}
function auth_login_app(): void {
    $body     = request_body();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $password === '') json_error('缺少 username 或 password');

    $stmt = db()->prepare('SELECT openid, password_hash FROM user_info WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row || empty($row['password_hash']) || !password_verify($password, $row['password_hash'])) {
        json_error('用户名或密码错误', 401);
    }

    json_ok(['token' => issue_token($row['openid']), 'openid' => $row['openid']]);
}
