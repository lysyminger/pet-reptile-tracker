<?php
// 前端控制器：所有 /api/* 请求都打到这里
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/response.php';

// CORS（小程序请求不需要 CORS，但开发时浏览器测试会用到）
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// 拆出 /api 之后的路径
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api#', '', $uri) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

// 路由表：每条 [METHOD, 正则, 处理文件, 函数名]
$routes = [
    ['POST',   '#^/auth/login$#',            'auth.php',      'auth_login'],

    // 微信消息推送回调（内容安全异步结果）：GET 校验 URL，POST 收推送
    ['GET',    '#^/wx/callback$#',           'wxcallback.php', 'wx_callback'],
    ['POST',   '#^/wx/callback$#',           'wxcallback.php', 'wx_callback'],

    ['GET',    '#^/user$#',                  'user.php',      'user_get'],
    ['POST',   '#^/user$#',                  'user.php',      'user_upsert'],

    ['GET',    '#^/pets$#',                  'pets.php',      'pets_list'],
    ['POST',   '#^/pets$#',                  'pets.php',      'pets_create'],
    ['GET',    '#^/pets/([\w-]+)$#',         'pets.php',      'pets_get'],
    ['PUT',    '#^/pets/([\w-]+)$#',         'pets.php',      'pets_update'],
    ['DELETE', '#^/pets/([\w-]+)$#',         'pets.php',      'pets_delete'],

    ['GET',    '#^/feed-logs$#',             'feed.php',      'feed_list'],
    ['GET',    '#^/feed-logs/count$#',       'feed.php',      'feed_count'],
    ['GET',    '#^/feed-logs/([\w-]+)$#',    'feed.php',      'feed_get'],
    ['POST',   '#^/feed-logs$#',             'feed.php',      'feed_create'],
    ['DELETE', '#^/feed-logs/([\w-]+)$#',    'feed.php',      'feed_delete'],

    ['GET',    '#^/weight-logs$#',           'weight.php',    'weight_list'],
    ['GET',    '#^/weight-logs/([\w-]+)$#',  'weight.php',    'weight_get'],
    ['POST',   '#^/weight-logs$#',           'weight.php',    'weight_create'],
    ['DELETE', '#^/weight-logs/([\w-]+)$#',  'weight.php',    'weight_delete'],

    ['GET',    '#^/substrate-logs$#',           'substrate.php', 'substrate_list'],
    ['GET',    '#^/substrate-logs/count$#',     'substrate.php', 'substrate_count'],
    ['GET',    '#^/substrate-logs/([\w-]+)$#',  'substrate.php', 'substrate_get'],
    ['POST',   '#^/substrate-logs$#',           'substrate.php', 'substrate_create'],
    ['DELETE', '#^/substrate-logs/([\w-]+)$#',  'substrate.php', 'substrate_delete'],

    // 打卡原子接口：一个事务里完成「写日志 + 更新下次计划日期」
    ['POST',   '#^/check-ins/feed$#',         'checkin.php',   'checkin_feed'],
    ['POST',   '#^/check-ins/substrate$#',    'checkin.php',   'checkin_substrate'],

    ['POST',   '#^/uploads$#',               'upload.php',    'upload_file'],

    ['GET',    '#^/pet-photos$#',            'photos.php',    'photos_list'],
    ['POST',   '#^/pet-photos$#',            'photos.php',    'photos_create'],
    ['PUT',    '#^/pet-photos/([\w-]+)$#',   'photos.php',    'photos_update'],
    ['DELETE', '#^/pet-photos/([\w-]+)$#',   'photos.php',    'photos_delete'],
];

// 免鉴权的公开 endpoint（登录、微信回调）——其余一律走 JWT
$PUBLIC_ROUTES = [
    '#^/auth/login$#',
    '#^/wx/callback$#',
];

foreach ($routes as [$m, $pattern, $file, $func]) {
    if ($m !== $method) continue;
    if (preg_match($pattern, $path, $matches)) {
        require __DIR__ . '/routes/' . $file;

        if (!in_array($pattern, $PUBLIC_ROUTES, true)) {
            $GLOBALS['openid'] = require_auth(); // 401 时内部直接 exit
        }

        // 把正则捕获到的参数（如 :id）作为后续参数传给 handler
        $args = array_slice($matches, 1);
        $func(...$args);
        exit;
    }
}

json_error('Not Found', 404);
