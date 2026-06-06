<?php
// 从 .env 加载配置（不引入第三方库，自己解析）
declare(strict_types=1);

function load_env(string $path): array {
    if (!is_file($path)) {
        http_response_code(500);
        echo json_encode(['error' => '.env not found at ' . $path]);
        exit;
    }
    $env = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (!str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $env[trim($k)] = trim($v);
    }
    return $env;
}

$ENV = load_env(__DIR__ . '/.env');

function env(string $key, ?string $default = null): string {
    global $ENV;
    return $ENV[$key] ?? $default ?? '';
}

// 让错误以 JSON 形式返回，避免 500 页面里泄漏堆栈
set_exception_handler(function (Throwable $e) {
    error_log('[unhandled] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Internal Server Error']);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});
