<?php
declare(strict_types=1);

const FEED_TABLE      = 'feed_logs';
const FEED_DATE_FIELD = 'feed_date';

// 列表：支持 ?pet_id=X 或 ?pet_ids=a,b,c，可选 order_by + limit
function feed_list(): void {
    $openid = $GLOBALS['openid'];
    $petIds = _resolve_pet_ids($openid);
    if (empty($petIds)) { json_ok([]); return; }

    $orderBy = ($_GET['order_by'] ?? '') === 'feed_date_desc'
        ? 'ORDER BY feed_date DESC, created_at DESC'
        : 'ORDER BY feed_date ASC';
    $limit   = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;

    $place = implode(',', array_fill(0, count($petIds), '?'));
    $sql = "SELECT * FROM feed_logs WHERE pet_id IN ($place) $orderBy LIMIT $limit";
    $stmt = db()->prepare($sql);
    $stmt->execute($petIds);
    json_ok($stmt->fetchAll());
}

function feed_get(string $id): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare(
        'SELECT f.* FROM feed_logs f JOIN pet_info p ON f.pet_id = p._id WHERE f._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok($row);
}

// 计数：?pet_ids=a,b,c[&feed_date=YYYY-MM-DD]
function feed_count(): void {
    $openid = $GLOBALS['openid'];
    $petIds = _resolve_pet_ids($openid);
    if (empty($petIds)) { json_ok(['count' => 0]); return; }

    $place  = implode(',', array_fill(0, count($petIds), '?'));
    $params = $petIds;
    $where  = "pet_id IN ($place)";
    if (!empty($_GET['feed_date'])) {
        $where .= ' AND feed_date = ?';
        $params[] = $_GET['feed_date'];
    }
    $stmt = db()->prepare("SELECT COUNT(*) AS c FROM feed_logs WHERE $where");
    $stmt->execute($params);
    $row = $stmt->fetch();
    json_ok(['count' => (int)$row['c']]);
}

function feed_create(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();
    $petId  = (string)($body['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    $id  = new_id();
    $now = date('Y-m-d H:i:s');
    $row = [
        '_id'        => $id,
        'pet_id'     => $petId,
        'feed_date'  => (string)($body['feed_date']  ?? ''),
        'food_type'  => (string)($body['food_type']  ?? ''),
        'amount'     => (string)($body['amount']     ?? ''),
        'created_at' => $now,
    ];
    $cols = array_keys($row);
    $sql = 'INSERT INTO feed_logs (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    db()->prepare($sql)->execute(array_values($row));
    json_ok($row);
}

function feed_delete(string $id): void {
    $openid = $GLOBALS['openid'];

    // JOIN 校验归属
    $stmt = db()->prepare(
        'SELECT f._id FROM feed_logs f JOIN pet_info p ON f.pet_id = p._id WHERE f._id = ? AND p.user_openid = ?'
    );
    $stmt->execute([$id, $openid]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    db()->prepare('DELETE FROM feed_logs WHERE _id = ?')->execute([$id]);
    json_ok(['ok' => true]);
}

// 私有：把 ?pet_id 或 ?pet_ids 解析成数组，并过滤掉不属于当前用户的
function _resolve_pet_ids(string $openid): array {
    $ids = [];
    if (!empty($_GET['pet_id']))   $ids = [(string)$_GET['pet_id']];
    elseif (!empty($_GET['pet_ids'])) $ids = split_ids($_GET['pet_ids']);
    if (empty($ids)) return [];

    // 只保留属于该用户的 pet_id（防越权 + 防 SQL 注入）
    $place = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare("SELECT _id FROM pet_info WHERE user_openid = ? AND _id IN ($place)");
    $stmt->execute(array_merge([$openid], $ids));
    return array_column($stmt->fetchAll(), '_id');
}
