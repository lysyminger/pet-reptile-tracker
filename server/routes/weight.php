<?php
declare(strict_types=1);

function weight_list(): void {
    $openid = $GLOBALS['openid'];
    $petIds = _resolve_pet_ids_weight($openid);
    if (empty($petIds)) { json_ok([]); return; }

    $orderBy = ($_GET['order_by'] ?? '') === 'record_date_desc'
        ? 'ORDER BY record_date DESC, created_at DESC'
        : 'ORDER BY record_date ASC';
    $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;

    $place = implode(',', array_fill(0, count($petIds), '?'));
    $sql = "SELECT * FROM weight_logs WHERE pet_id IN ($place) $orderBy LIMIT $limit";
    $stmt = db()->prepare($sql);
    $stmt->execute($petIds);
    json_ok($stmt->fetchAll());
}

function weight_get(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare(
        'SELECT w.* FROM weight_logs w JOIN pet_info p ON w.pet_id = p._id WHERE w._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

function weight_create(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();
    $petId  = (string)($body['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    $weight = isset($body['weight']) ? (float)$body['weight'] : 0;
    if ($weight <= 0) json_error('体重必须大于 0');

    $id  = new_id();
    $now = date('Y-m-d H:i:s');
    $row = [
        '_id'         => $id,
        'pet_id'      => $petId,
        'weight'      => $weight,
        'record_date' => (string)($body['record_date'] ?? ''),
        'created_at'  => $now,
    ];
    $cols = array_keys($row);
    $sql = 'INSERT INTO weight_logs (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));
    json_ok($row);
}

function weight_delete(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare(
        'SELECT w._id FROM weight_logs w JOIN pet_info p ON w.pet_id = p._id WHERE w._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    db()->prepare('DELETE FROM weight_logs WHERE _id = ?')->execute([$id]);
    json_ok(['ok' => true]);
}

function _resolve_pet_ids_weight(string $openid): array {
    $ids = [];
    if (!empty($_GET['pet_id']))      $ids = [(string)$_GET['pet_id']];
    elseif (!empty($_GET['pet_ids'])) $ids = split_ids($_GET['pet_ids']);
    if (empty($ids)) return [];
    $place = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare("SELECT _id FROM pet_info WHERE user_openid = ? AND _id IN ($place)");
    $stmt->execute(array_merge([$openid], $ids));
    return array_column($stmt->fetchAll(), '_id');
}
