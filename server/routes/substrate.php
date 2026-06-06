<?php
declare(strict_types=1);

function substrate_list(): void {
    $openid = $GLOBALS['openid'];
    $petIds = _resolve_pet_ids_sub($openid);
    if (empty($petIds)) { json_ok([]); return; }

    $orderBy = ($_GET['order_by'] ?? '') === 'change_date_desc'
        ? 'ORDER BY change_date DESC, created_at DESC'
        : 'ORDER BY change_date ASC';
    $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;

    $place = implode(',', array_fill(0, count($petIds), '?'));
    $sql = "SELECT * FROM substrate_logs WHERE pet_id IN ($place) $orderBy LIMIT $limit";
    $stmt = db()->prepare($sql);
    $stmt->execute($petIds);
    json_ok($stmt->fetchAll());
}

function substrate_get(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare(
        'SELECT s.* FROM substrate_logs s JOIN pet_info p ON s.pet_id = p._id WHERE s._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

function substrate_count(): void {
    $openid = $GLOBALS['openid'];
    $petIds = _resolve_pet_ids_sub($openid);
    if (empty($petIds)) { json_ok(['count' => 0]); return; }

    $place  = implode(',', array_fill(0, count($petIds), '?'));
    $params = $petIds;
    $where  = "pet_id IN ($place)";
    if (!empty($_GET['change_date'])) {
        $where .= ' AND change_date = ?';
        $params[] = $_GET['change_date'];
    }
    $stmt = db()->prepare("SELECT COUNT(*) AS c FROM substrate_logs WHERE $where");
    $stmt->execute($params);
    $row = $stmt->fetch();
    json_ok(['count' => (int)$row['c']]);
}

function substrate_create(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();
    $petId  = (string)($body['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    $id  = new_id();
    $now = date('Y-m-d H:i:s');
    $row = [
        '_id'         => $id,
        'pet_id'      => $petId,
        'change_date' => (string)($body['change_date'] ?? ''),
        'sub_type'    => (string)($body['sub_type']    ?? ''),
        'created_at'  => $now,
    ];
    $cols = array_keys($row);
    $sql = 'INSERT INTO substrate_logs (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));
    json_ok($row);
}

function substrate_delete(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare(
        'SELECT s._id FROM substrate_logs s JOIN pet_info p ON s.pet_id = p._id WHERE s._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    db()->prepare('DELETE FROM substrate_logs WHERE _id = ?')->execute([$id]);
    json_ok(['ok' => true]);
}

function _resolve_pet_ids_sub(string $openid): array {
    $ids = [];
    if (!empty($_GET['pet_id']))      $ids = [(string)$_GET['pet_id']];
    elseif (!empty($_GET['pet_ids'])) $ids = split_ids($_GET['pet_ids']);
    if (empty($ids)) return [];
    $place = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare("SELECT _id FROM pet_info WHERE user_openid = ? AND _id IN ($place)");
    $stmt->execute(array_merge([$openid], $ids));
    return array_column($stmt->fetchAll(), '_id');
}
