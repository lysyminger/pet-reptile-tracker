<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/mailer.php';

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

// 校验邮箱验证码：命中即作废（一次性、防重放）。
function verify_email_code(string $email, string $purpose, string $code): bool {
    if ($email === '' || $code === '') return false;
    $stmt = db()->prepare(
        'SELECT id FROM email_codes WHERE email = ? AND purpose = ? AND code = ? AND used = 0 AND expires_at >= ? ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([$email, $purpose, $code, date('Y-m-d H:i:s')]);
    $row = $stmt->fetch();
    if (!$row) return false;
    db()->prepare('UPDATE email_codes SET used = 1 WHERE id = ?')->execute([$row['id']]);
    return true;
}

// POST /auth/send-code {email, purpose}  purpose: register|reset
// 验证码生成/存储/发信全部服务器端完成；60s 限频；10 分钟有效。
function auth_send_code(): void {
    $body    = request_body();
    $email   = strtolower(trim((string)($body['email'] ?? '')));
    $purpose = trim((string)($body['purpose'] ?? 'register'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('邮箱格式不正确');
    if (!in_array($purpose, ['register', 'reset'], true)) $purpose = 'register';

    // 注册：邮箱不能已被占用；找回：邮箱必须已注册
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE email = ?');
    $stmt->execute([$email]);
    $exists = (bool)$stmt->fetch();
    // 注意：服务器 nginx 开了 fastcgi_intercept_errors，会把 404 替换成 HTML 页面，
    // 故这类用户可见校验错误一律用 400，保证返回我们的 JSON 提示。
    if ($purpose === 'register' && $exists)  json_error('该邮箱已注册', 400);
    if ($purpose === 'reset'    && !$exists) json_error('该邮箱未注册', 400);

    // 60 秒限频，防刷爆 QQ 发信配额
    $stmt = db()->prepare('SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$email, $purpose]);
    $last = $stmt->fetch();
    if ($last && (time() - strtotime((string)$last['created_at'])) < 60) {
        json_error('发送过于频繁，请 60 秒后再试', 429);
    }

    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $now  = date('Y-m-d H:i:s');
    $exp  = date('Y-m-d H:i:s', time() + 600); // 10 分钟
    db()->prepare('INSERT INTO email_codes (email, code, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)')
        ->execute([$email, $code, $purpose, $exp, $now]);

    $title   = $purpose === 'reset' ? '蜕变记 · 密码重置验证码' : '蜕变记 · 注册验证码';
    $action  = $purpose === 'reset' ? '重置密码' : '注册账号';
    $html =
        '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">' .
        '<h2 style="color:#2e7d5b;">蜕变记</h2>' .
        '<p>你正在' . $action . '，验证码为：</p>' .
        '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2e7d5b;">' . $code . '</p>' .
        '<p style="color:#888;">验证码 10 分钟内有效。如非本人操作，请忽略本邮件。</p>' .
        '</div>';

    if (!send_mail($email, $title, $html)) json_error('邮件发送失败，请稍后再试', 500);
    json_ok(['sent' => true]);
}

// POST /auth/register {username, password, nickname?, email, code}
function auth_register(): void {
    $body     = request_body();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $nickname = trim((string)($body['nickname'] ?? ''));
    $email    = strtolower(trim((string)($body['email'] ?? '')));
    $code     = trim((string)($body['code'] ?? ''));

    if ($username === '' || $password === '') json_error('缺少 username 或 password');
    if (mb_strlen($username) > 64)            json_error('用户名过长');
    if (strlen($password) < 6)                json_error('密码至少 6 位');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('邮箱格式不正确');

    // 用户名唯一
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) json_error('用户名已被占用', 409);
    // 邮箱唯一
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) json_error('该邮箱已注册', 409);

    if (!verify_email_code($email, 'register', $code)) json_error('验证码错误或已过期', 400);

    $openid = 'hm_' . bin2hex(random_bytes(13));
    $hash   = password_hash($password, PASSWORD_DEFAULT);
    $now    = date('Y-m-d H:i:s');
    if ($nickname === '') $nickname = $username;

    $ins = db()->prepare(
        'INSERT INTO user_info (openid, username, password_hash, nickname, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([$openid, $username, $hash, $nickname, $email, $now, $now]);

    json_ok(['token' => issue_token($openid), 'openid' => $openid]);
}

// POST /auth/reset-password {username, email, code, password}
// 验证码服务端校验；用户名+邮箱须匹配同一账号；通过后写入新密码。
function auth_reset_password(): void {
    $body     = request_body();
    $username = trim((string)($body['username'] ?? ''));
    $email    = strtolower(trim((string)($body['email'] ?? '')));
    $code     = trim((string)($body['code'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $email === '' || $code === '' || $password === '') json_error('参数不完整');
    if (strlen($password) < 6) json_error('密码至少 6 位');

    $stmt = db()->prepare('SELECT openid, email FROM user_info WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    if (!$row || strtolower((string)($row['email'] ?? '')) !== $email) json_error('用户名与邮箱不匹配', 400);

    if (!verify_email_code($email, 'reset', $code)) json_error('验证码错误或已过期', 400);

    $hash = password_hash($password, PASSWORD_DEFAULT);
    db()->prepare('UPDATE user_info SET password_hash = ?, updatedAt = ? WHERE openid = ?')
        ->execute([$hash, date('Y-m-d H:i:s'), $row['openid']]);
    json_ok(['reset' => true]);
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
