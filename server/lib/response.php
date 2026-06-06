<?php
declare(strict_types=1);

function json_ok($data = null, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $msg, int $code = 400): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// 解析 JSON 请求体
function request_body(): array {
    static $body = null;
    if ($body !== null) return $body;
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return $body = [];
    $decoded = json_decode($raw, true);
    return $body = is_array($decoded) ? $decoded : [];
}

// 校验 pet_id 属于当前 openid（保证不能跨用户读/写 logs）
function assert_pet_owned(string $petId, string $openid): void {
    $stmt = db()->prepare('SELECT user_openid FROM pet_info WHERE _id = ?');
    $stmt->execute([$petId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Pet not found', 404);
    if ($row['user_openid'] !== $openid) json_error('Forbidden', 403);
}

// 把以逗号分隔的字符串转成数组（用于批量查询的 pet_ids 参数）
function split_ids(?string $s): array {
    if (!$s) return [];
    $out = [];
    foreach (explode(',', $s) as $part) {
        $part = trim($part);
        if ($part !== '') $out[] = $part;
    }
    return $out;
}
