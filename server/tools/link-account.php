<?php
/**
 * 账号绑定工具（CLI · 一次性运维脚本，不接入路由，对线上运行零影响）。
 *
 * 用途：把一个鸿蒙端「账号+密码」绑定到一个【已存在的】用户行（通常是你的微信用户行），
 *       从而鸿蒙端用该账号登录后，拿到的是同一个 openid，看到的是同一份数据。
 *
 * 前置：先在库里执行 sql/harmony-auth.sql（给 user_info 加 username/password_hash 列）。
 *
 * 用法（在服务器上，server 目录下执行）：
 *   1) 列出候选用户，找到你自己的微信 openid：
 *        php tools/link-account.php list
 *   2) 把账号密码绑定到该 openid：
 *        php tools/link-account.php bind <openid> <username> <password>
 *      例：php tools/link-account.php bind oq_xxxxxxxxxxxxx 你的用户名 你的密码
 *
 * 再次执行 bind 同一 openid 可重置该账号的用户名/密码（幂等）。
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("仅限命令行执行\n");
}

require __DIR__ . '/../config.php';
require __DIR__ . '/../lib/db.php';

function fail(string $msg): void {
    fwrite(STDERR, "✗ $msg\n");
    exit(1);
}

// 确认 username/password_hash 列已存在，否则提示先跑迁移
function ensure_columns(): void {
    $cols = db()->query("SHOW COLUMNS FROM user_info")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('username', $cols, true) || !in_array('password_hash', $cols, true)) {
        fail("user_info 缺少 username/password_hash 列，请先执行 sql/harmony-auth.sql");
    }
}

$cmd = $argv[1] ?? '';

if ($cmd === 'list') {
    ensure_columns();
    // 列出所有用户：openid / 昵称 / 宠物数 / 是否微信号(hm_ 开头为鸿蒙) / 已绑定的用户名
    $rows = db()->query(
        "SELECT u.openid, u.nickname, u.username,
                (SELECT COUNT(*) FROM pet_info p WHERE p.user_openid = u.openid) AS pets
         FROM user_info u
         ORDER BY pets DESC, u.createdAt ASC"
    )->fetchAll();

    if (!$rows) { echo "（库里还没有用户）\n"; exit(0); }

    printf("%-36s | %-4s | %-6s | %-12s | %s\n", 'openid', '宠物', '类型', '已绑账号', '昵称');
    echo str_repeat('-', 90) . "\n";
    foreach ($rows as $r) {
        $type = str_starts_with((string)$r['openid'], 'hm_') ? '鸿蒙' : '微信';
        printf(
            "%-36s | %-4s | %-6s | %-12s | %s\n",
            $r['openid'],
            (string)$r['pets'],
            $type,
            $r['username'] ?? '-',
            $r['nickname'] ?? ''
        );
    }
    echo "\n提示：找到你自己的微信行（通常宠物数最多、类型=微信），复制其 openid 用于 bind。\n";
    exit(0);
}

if ($cmd === 'bind') {
    ensure_columns();
    $openid   = (string)($argv[2] ?? '');
    $username = (string)($argv[3] ?? '');
    $password = (string)($argv[4] ?? '');
    if ($openid === '' || $username === '' || $password === '') {
        fail("用法: php tools/link-account.php bind <openid> <username> <password>");
    }
    if (strlen($password) < 6) fail("密码至少 6 位");

    // 目标 openid 必须已存在
    $stmt = db()->prepare('SELECT openid, nickname FROM user_info WHERE openid = ?');
    $stmt->execute([$openid]);
    $target = $stmt->fetch();
    if (!$target) fail("openid 不存在：$openid（先用 list 确认）");

    // 用户名不能被【其它】openid 占用
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE username = ? AND openid <> ?');
    $stmt->execute([$username, $openid]);
    if ($stmt->fetch()) fail("用户名 '$username' 已被其它账号占用");

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $now  = date('Y-m-d H:i:s');
    db()->prepare('UPDATE user_info SET username = ?, password_hash = ?, updatedAt = ? WHERE openid = ?')
        ->execute([$username, $hash, $now, $openid]);

    echo "✓ 绑定成功\n";
    echo "  openid   : $openid\n";
    echo "  昵称     : " . ($target['nickname'] ?? '') . "\n";
    echo "  鸿蒙登录 : 用户名 $username + 你设置的密码\n";
    echo "  现在鸿蒙端用该账号登录，看到的就是这个 openid 名下的全部数据。\n";
    exit(0);
}

echo <<<TXT
账号绑定工具
  php tools/link-account.php list
      列出所有用户（含 openid / 宠物数 / 类型 / 已绑账号），用于找到你的微信 openid
  php tools/link-account.php bind <openid> <username> <password>
      把账号密码绑定到该 openid（鸿蒙端用此账号登录即共享该 openid 的数据）

TXT;
exit($cmd === '' ? 0 : 1);
