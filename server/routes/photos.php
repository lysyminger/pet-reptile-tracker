<?php
// 宠物相册：列表 / 新增 / 删除。归属一律以 JWT 的 openid 为准。
declare(strict_types=1);

// GET /pet-photos?pet_id=X —— 按宠物列出相册（倒序，最新在前）
function photos_list(): void {
    $openid = $GLOBALS['openid'];
    $petId  = (string)($_GET['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    $limit = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 100;
    $stmt = db()->prepare("SELECT * FROM pet_photos WHERE pet_id = ? ORDER BY created_at DESC LIMIT $limit");
    $stmt->execute([$petId]);
    json_ok($stmt->fetchAll());
}

// POST /pet-photos —— body: { pet_id, url, thumb_url?, caption? }
function photos_create(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();
    $petId  = (string)($body['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    $url = (string)($body['url'] ?? '');
    if ($url === '') json_error('缺少 url');

    $id  = new_id();
    $now = date('Y-m-d H:i:s');
    $row = [
        '_id'        => $id,
        'pet_id'     => $petId,
        'url'        => $url,
        'thumb_url'  => isset($body['thumb_url']) ? (string)$body['thumb_url'] : null,
        'caption'    => isset($body['caption'])   ? (string)$body['caption']   : null,
        'created_at' => $now,
    ];
    $cols = array_keys($row);
    $sql = 'INSERT INTO pet_photos (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));
    json_ok($row);
}

// DELETE /pet-photos/:id —— 删记录 + 删物理文件（原图 + 缩略图）
function photos_delete(string $id): void {
    $openid = $GLOBALS['openid'];

    $stmt = db()->prepare(
        'SELECT ph.url, ph.thumb_url FROM pet_photos ph JOIN pet_info p ON ph.pet_id = p._id WHERE ph._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);

    db()->prepare('DELETE FROM pet_photos WHERE _id = ?')->execute([$id]);

    // 删文件（仅限本服务 uploads 目录内）。delete_uploaded_file 定义在 wxcallback.php，
    // 这里独立实现一份，避免跨文件依赖。
    photos_unlink_by_url($row['url']);
    if (!empty($row['thumb_url'])) photos_unlink_by_url($row['thumb_url']);

    json_ok(['ok' => true]);
}

function photos_unlink_by_url(string $url): void {
    $prefix = rtrim(env('UPLOAD_URL_PREFIX'), '/') . '/';
    if (strncmp($url, $prefix, strlen($prefix)) !== 0) return;
    $name = basename(substr($url, strlen($prefix)));
    if ($name === '' || strpbrk($name, "/\\") !== false) return;
    $path = __DIR__ . '/../uploads/' . $name;
    if (is_file($path)) @unlink($path);
}
