<?php
declare(strict_types=1);

// 打卡原子接口
// ----------------------------------------------------------------------------
// 把「写打卡日志」+「更新下次计划日期」放进同一个事务，避免出现
//   日志已写入、但 next_feed_date / next_sub_date 没更新
// 这种「半成功」状态（旧逻辑是前端先 POST 日志、再 PUT 宠物，两步任一失败就不一致）。
//
//   下次计划日期 = 本次打卡日期 + 该宠物的频率天数（频率无效则不排期）
//
// POST /check-ins/feed       body: { pet_id, feed_date, food_type, amount }
// POST /check-ins/substrate  body: { pet_id, change_date, sub_type }

function checkin_feed(): void {
    _checkin('feed');
}

function checkin_substrate(): void {
    _checkin('substrate');
}

function _checkin(string $type): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();
    $petId  = (string)($body['pet_id'] ?? '');
    if ($petId === '') json_error('缺少 pet_id');
    assert_pet_owned($petId, $openid);

    if ($type === 'feed') {
        $table       = 'feed_logs';
        $dateField   = 'feed_date';
        $intervalCol = 'feed_interval';
        $nextCol     = 'next_feed_date';
        $date        = (string)($body['feed_date'] ?? '');
        $extra = [
            'food_type' => (string)($body['food_type'] ?? ''),
            'amount'    => (string)($body['amount'] ?? ''),
        ];
    } else {
        $table       = 'substrate_logs';
        $dateField   = 'change_date';
        $intervalCol = 'sub_interval';
        $nextCol     = 'next_sub_date';
        $date        = (string)($body['change_date'] ?? '');
        $extra = [
            'sub_type' => (string)($body['sub_type'] ?? ''),
        ];
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('日期格式应为 YYYY-MM-DD');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        // 事务内读取频率，确保用的是最新值
        $stmt = $pdo->prepare("SELECT $intervalCol AS iv FROM pet_info WHERE _id = ?");
        $stmt->execute([$petId]);
        $petRow   = $stmt->fetch();
        $interval = ($petRow && $petRow['iv'] !== null) ? (int)$petRow['iv'] : 0;

        // 写日志
        $id  = new_id();
        $now = date('Y-m-d H:i:s');
        $row = array_merge(
            ['_id' => $id, 'pet_id' => $petId, $dateField => $date],
            $extra,
            ['created_at' => $now]
        );
        $cols = array_keys($row);
        $sql  = "INSERT INTO $table (" . implode(',', $cols) . ') VALUES ('
              . implode(',', array_fill(0, count($cols), '?')) . ')';
        $pdo->prepare($sql)->execute(array_values($row));

        // 更新下次计划日期（频率有效才排期）
        $nextDate = null;
        if ($interval > 0) {
            $nextDate = date('Y-m-d', strtotime($date . ' +' . $interval . ' days'));
            $pdo->prepare("UPDATE pet_info SET $nextCol = ? WHERE _id = ?")
                ->execute([$nextDate, $petId]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_ok(['ok' => true, 'log' => $row, $nextCol => $nextDate]);
}
