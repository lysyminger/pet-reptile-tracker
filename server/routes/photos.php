<?php
// 宠物相册：列表 / 新增 / 删除。归属一律以 JWT 的 openid 为准。
declare(strict_types=1);

// 是否存在可选的 length_cm 列（鸿蒙端体长曲线用）。未执行 ALTER 时静默忽略，绝不影响相册。
// 小程序自身从不读写该列，行为完全不变。
function photos_has_length(): bool {
    static $has = null;
    if ($has === null) {
        try {
            $stmt = db()->query("SHOW COLUMNS FROM pet_photos LIKE 'length_cm'");
            $has = (bool)$stmt->fetch();
        } catch (Throwable $e) {
            $has = false;
        }
    }
    return $has;
}

// GET /pet-photos?pet_id=X —— 按宠物列出；不传 pet_id 则列出该用户所有宠物的照片
// 排序按拍摄时间(taken_at)优先、其次创建时间，倒序（时间轴最新在前）
function photos_list(): void {
    $openid = $GLOBALS['openid'];
    $petId  = (string)($_GET['pet_id'] ?? '');
    $limit  = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 300;
    $order  = 'ORDER BY COALESCE(ph.taken_at, ph.created_at) DESC, ph.created_at DESC';

    if ($petId !== '') {
        assert_pet_owned($petId, $openid);
        $stmt = db()->prepare("SELECT ph.* FROM pet_photos ph WHERE ph.pet_id = ? $order LIMIT $limit");
        $stmt->execute([$petId]);
    } else {
        // 全部：JOIN 限定本用户的宠物，并带上宠物名字方便前端「全部」视图标注
        $stmt = db()->prepare(
            "SELECT ph.*, p.name AS pet_name FROM pet_photos ph
             JOIN pet_info p ON ph.pet_id = p._id
             WHERE p.user_openid = ? $order LIMIT $limit"
        );
        $stmt->execute([$openid]);
    }
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
    // 拍摄时间：客户端可传 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:MM:SS"，不传则用当前时间
    $takenAt = isset($body['taken_at']) ? trim((string)$body['taken_at']) : '';
    if ($takenAt !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $takenAt)) {
        $takenAt .= ' 12:00:00';
    }
    if ($takenAt === '' || !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $takenAt)) {
        $takenAt = $now;
    }

    $row = [
        '_id'        => $id,
        'pet_id'     => $petId,
        'url'        => $url,
        'thumb_url'  => isset($body['thumb_url']) ? (string)$body['thumb_url'] : null,
        'caption'    => isset($body['caption'])   ? (string)$body['caption']   : null,
        'taken_at'   => $takenAt,
        'created_at' => $now,
    ];
    // 可选体长（仅当列存在且客户端传了数值）——纯增量，小程序不传此字段
    if (photos_has_length() && isset($body['length_cm']) && is_numeric($body['length_cm'])) {
        $row['length_cm'] = (float)$body['length_cm'];
    }
    $cols = array_keys($row);
    $sql = 'INSERT INTO pet_photos (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));
    json_ok($row);
}

// PUT /pet-photos/:id —— 修改照片信息（目前支持 taken_at 拍摄时间、caption）
function photos_update(string $id): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();

    $stmt = db()->prepare(
        'SELECT ph._id FROM pet_photos ph JOIN pet_info p ON ph.pet_id = p._id WHERE ph._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    $fields = []; $vals = [];
    if (array_key_exists('taken_at', $body)) {
        $t = trim((string)$body['taken_at']);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $t)) $t .= ' 12:00:00';
        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $t)) json_error('taken_at 格式错误');
        $fields[] = 'taken_at = ?'; $vals[] = $t;
    }
    if (array_key_exists('caption', $body)) {
        $fields[] = 'caption = ?'; $vals[] = (string)$body['caption'];
    }
    if (photos_has_length() && array_key_exists('length_cm', $body)) {
        $fields[] = 'length_cm = ?';
        $vals[] = $body['length_cm'] === null || $body['length_cm'] === '' ? null : (float)$body['length_cm'];
    }
    if (empty($fields)) json_error('无可更新字段');

    $vals[] = $id;
    db()->prepare('UPDATE pet_photos SET ' . implode(', ', $fields) . ' WHERE _id = ?')->execute($vals);

    $r = db()->prepare('SELECT * FROM pet_photos WHERE _id = ?');
    $r->execute([$id]);
    json_ok($r->fetch());
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
    delete_upload_by_url($url, __DIR__ . '/../uploads');
}

// 由对外 URL 反推本地文件并删除，支持 openid/年/月 子目录；防 .. 越界
function delete_upload_by_url(string $url, string $uploadsDir): void {
    $prefix = rtrim(env('UPLOAD_URL_PREFIX'), '/') . '/';
    if (strncmp($url, $prefix, strlen($prefix)) !== 0) return;
    $rel = ltrim(substr($url, strlen($prefix)), '/');
    if ($rel === '' || strpos($rel, '..') !== false) return;
    $root = realpath($uploadsDir);
    if ($root === false) return;
    $real = realpath($root . '/' . $rel);
    if ($real !== false && strncmp($real, $root, strlen($root)) === 0 && is_file($real)) {
        @unlink($real);
    }
}
