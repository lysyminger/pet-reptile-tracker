<?php
declare(strict_types=1);

const PET_UPDATABLE = [
    'name', 'species', 'avatar', 'arrivalDate', 'initialWeight',
    'feed_interval', 'sub_interval', 'next_feed_date', 'next_sub_date'
];

function pets_list(): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare('SELECT * FROM pet_info WHERE user_openid = ? ORDER BY created_at ASC');
    $stmt->execute([$openid]);
    json_ok($stmt->fetchAll());
}

function pets_get(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare('SELECT * FROM pet_info WHERE _id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_openid'] !== $openid) json_error('Forbidden', 403);
    json_ok($row);
}

function pets_create(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();

    $id = new_id();
    $now = date('Y-m-d H:i:s');

    $row = [
        '_id'            => $id,
        'user_openid'    => $openid, // 强制服务端 openid，忽略客户端传入
        'name'           => (string)($body['name'] ?? ''),
        'species'        => (string)($body['species'] ?? ''),
        'avatar'         => (string)($body['avatar'] ?? ''),
        'arrivalDate'    => (string)($body['arrivalDate'] ?? ''),
        'initialWeight'  => isset($body['initialWeight']) ? (float)$body['initialWeight'] : 0,
        'feed_interval'  => isset($body['feed_interval']) ? (int)$body['feed_interval'] : null,
        'sub_interval'   => isset($body['sub_interval'])  ? (int)$body['sub_interval']  : null,
        'next_feed_date' => $body['next_feed_date'] ?? null,
        'next_sub_date'  => $body['next_sub_date']  ?? null,
        'created_at'     => $now,
    ];

    $cols = array_keys($row);
    $sql = 'INSERT INTO pet_info (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));

    json_ok($row);
}

function pets_update(string $id): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();

    // 校验归属
    $stmt = db()->prepare('SELECT user_openid FROM pet_info WHERE _id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_openid'] !== $openid) json_error('Forbidden', 403);

    $fields = []; $values = [];
    foreach (PET_UPDATABLE as $k) {
        if (array_key_exists($k, $body)) {
            $fields[] = "$k = ?";
            $v = $body[$k];
            if ($k === 'initialWeight') $v = $v === null ? null : (float)$v;
            elseif ($k === 'feed_interval' || $k === 'sub_interval') $v = $v === null ? null : (int)$v;
            $values[] = $v;
        }
    }
    if (empty($fields)) { pets_get($id); return; }
    $values[] = $id;
    db()->prepare('UPDATE pet_info SET ' . implode(', ', $fields) . ' WHERE _id = ?')->execute($values);

    pets_get($id);
}

function pets_delete(string $id): void {
    $openid = $GLOBALS['openid'];

    $stmt = db()->prepare('SELECT user_openid FROM pet_info WHERE _id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_openid'] !== $openid) json_error('Forbidden', 403);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM feed_logs      WHERE pet_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM weight_logs    WHERE pet_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM substrate_logs WHERE pet_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM pet_info       WHERE _id    = ?')->execute([$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    json_ok(['ok' => true]);
}
