<?php
declare(strict_types=1);

function user_get(): void {
    $openid = $GLOBALS['openid'];
    $stmt = db()->prepare('SELECT openid, nickname, avatarUrl, phone, createdAt, updatedAt FROM user_info WHERE openid = ?');
    $stmt->execute([$openid]);
    $row = $stmt->fetch();
    json_ok($row ?: null);
}

function user_upsert(): void {
    $openid = $GLOBALS['openid'];
    $body   = request_body();

    // 只允许更新这几个字段，避免客户端污染 openid 等
    $allowed = ['nickname', 'avatarUrl', 'phone'];
    $fields  = [];
    $values  = [];
    foreach ($allowed as $k) {
        if (array_key_exists($k, $body)) {
            $fields[] = $k;
            $values[] = is_string($body[$k]) ? $body[$k] : null;
        }
    }

    $now = date('Y-m-d H:i:s');

    // 先查是否存在
    $stmt = db()->prepare('SELECT openid FROM user_info WHERE openid = ?');
    $stmt->execute([$openid]);

    if ($stmt->fetch()) {
        // 更新
        if (empty($fields)) {
            // 没有要改的字段，直接返回当前数据
            user_get(); return;
        }
        $set = implode(', ', array_map(fn($f) => "$f = ?", $fields));
        $set .= ', updatedAt = ?';
        $values[] = $now;
        $values[] = $openid;
        $sql = "UPDATE user_info SET $set WHERE openid = ?";
        db()->prepare($sql)->execute($values);
    } else {
        // 插入
        $cols = array_merge(['openid'], $fields, ['createdAt', 'updatedAt']);
        $placeholders = implode(', ', array_fill(0, count($cols), '?'));
        $row = array_merge([$openid], $values, [$now, $now]);
        $sql = 'INSERT INTO user_info (' . implode(', ', $cols) . ') VALUES (' . $placeholders . ')';
        db()->prepare($sql)->execute($row);
    }

    user_get();
}
