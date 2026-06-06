<?php
// 一次性数据迁移脚本
// 使用方式：在服务器上把 5 个 JSON 文件传到 server/migrations/data/，然后:
//   cd /www/wwwroot/api.lysyminger.online && php migrate.php
// 跑完后立刻删掉本脚本 + data 目录
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/lib/db.php';

// CLI 防呆：阻止从 Web 触发
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "本脚本只允许在命令行 (php migrate.php) 运行";
    exit;
}

$DATA_DIR = __DIR__ . '/migrations/data';
if (!is_dir($DATA_DIR)) {
    fwrite(STDERR, "数据目录不存在: $DATA_DIR\n请把 5 个 JSON 文件放到这里\n");
    exit(1);
}

// 把云开发导出的日期 {"$date":"2026-03-26T15:34:00.381Z"} → MySQL DATETIME
function conv_date($v): ?string {
    if (is_array($v) && isset($v['$date'])) {
        $ts = strtotime($v['$date']);
        return $ts ? date('Y-m-d H:i:s', $ts) : null;
    }
    if (is_string($v) && $v !== '') {
        $ts = strtotime($v);
        return $ts ? date('Y-m-d H:i:s', $ts) : null;
    }
    return null;
}

// 让用户选具体文件：脚本会自动通过字段特征识别每个 JSON 是哪张表
function detect_table(array $sample): string {
    $keys = array_keys($sample);
    if (in_array('food_type', $keys, true))     return 'feed_logs';
    if (in_array('record_date', $keys, true))   return 'weight_logs';
    if (in_array('change_date', $keys, true))   return 'substrate_logs';
    if (in_array('user_openid', $keys, true))   return 'pet_info';
    if (in_array('openid', $keys, true))        return 'user_info';
    return 'unknown';
}

// 逐表灌库
$files = glob($DATA_DIR . '/*.json');
if (empty($files)) {
    fwrite(STDERR, "在 $DATA_DIR 下没找到 .json 文件\n");
    exit(1);
}

foreach ($files as $file) {
    echo "\n===== 处理 " . basename($file) . " =====\n";
    $fh = fopen($file, 'r');
    if (!$fh) { fwrite(STDERR, "无法打开 $file\n"); continue; }

    // 取第一行判断是哪张表
    $first = fgets($fh);
    if ($first === false) { echo "  空文件，跳过\n"; fclose($fh); continue; }
    $sample = json_decode(trim($first), true);
    if (!is_array($sample)) { fwrite(STDERR, "  第一行不是有效 JSON，跳过\n"); fclose($fh); continue; }

    $table = detect_table($sample);
    if ($table === 'unknown') { fwrite(STDERR, "  无法识别表类型，跳过\n"); fclose($fh); continue; }
    echo "  → 表: $table\n";

    // 重新读文件
    rewind($fh);

    $ok = 0; $skipped = 0; $bad = 0;
    while (($line = fgets($fh)) !== false) {
        $line = trim($line);
        if ($line === '') continue;
        $row = json_decode($line, true);
        if (!is_array($row)) { $bad++; continue; }

        try {
            switch ($table) {
                case 'pet_info':
                    $r = [
                        '_id'            => (string)($row['_id'] ?? new_id()),
                        'user_openid'    => (string)($row['user_openid'] ?? ''),
                        'name'           => (string)($row['name']    ?? ''),
                        'species'        => (string)($row['species'] ?? ''),
                        // cloud:// 头像清空，让用户重传
                        'avatar'         => (isset($row['avatar']) && !str_starts_with((string)$row['avatar'], 'cloud://'))
                                            ? (string)$row['avatar'] : '',
                        'arrivalDate'    => (string)($row['arrivalDate'] ?? ''),
                        'initialWeight'  => isset($row['initialWeight']) ? (float)$row['initialWeight'] : null,
                        'feed_interval'  => isset($row['feed_interval']) ? (int)$row['feed_interval'] : null,
                        'sub_interval'   => isset($row['sub_interval'])  ? (int)$row['sub_interval']  : null,
                        'next_feed_date' => $row['next_feed_date'] ?? null,
                        'next_sub_date'  => $row['next_sub_date']  ?? null,
                        'created_at'     => conv_date($row['created_at'] ?? null),
                    ];
                    if ($r['user_openid'] === '') { $skipped++; break; }
                    insert_row('pet_info', $r); $ok++;
                    break;

                case 'feed_logs':
                    $r = [
                        '_id'        => (string)($row['_id'] ?? new_id()),
                        'pet_id'     => (string)($row['pet_id'] ?? ''),
                        'feed_date'  => $row['feed_date'] ?? null,
                        'food_type'  => $row['food_type'] ?? null,
                        'amount'     => $row['amount']    ?? null,
                        'created_at' => conv_date($row['created_at'] ?? null),
                    ];
                    if ($r['pet_id'] === '' || $r['pet_id'] === 'undefined') { $skipped++; break; }
                    insert_row('feed_logs', $r); $ok++;
                    break;

                case 'weight_logs':
                    $r = [
                        '_id'         => (string)($row['_id'] ?? new_id()),
                        'pet_id'      => (string)($row['pet_id'] ?? ''),
                        'weight'      => isset($row['weight']) ? (float)$row['weight'] : null,
                        'record_date' => $row['record_date'] ?? null,
                        'created_at'  => conv_date($row['created_at'] ?? null),
                    ];
                    if ($r['pet_id'] === '' || $r['pet_id'] === 'undefined') { $skipped++; break; }
                    insert_row('weight_logs', $r); $ok++;
                    break;

                case 'substrate_logs':
                    $r = [
                        '_id'         => (string)($row['_id'] ?? new_id()),
                        'pet_id'      => (string)($row['pet_id'] ?? ''),
                        'change_date' => $row['change_date'] ?? null,
                        'sub_type'    => $row['sub_type']    ?? null,
                        'created_at'  => conv_date($row['created_at'] ?? null),
                    ];
                    if ($r['pet_id'] === '' || $r['pet_id'] === 'undefined') { $skipped++; break; }
                    insert_row('substrate_logs', $r); $ok++;
                    break;

                case 'user_info':
                    // 老的 http://tmp/ 头像清空
                    $av = (string)($row['avatarUrl'] ?? '');
                    if (str_starts_with($av, 'http://tmp/')) $av = '';
                    $r = [
                        'openid'    => (string)($row['openid'] ?? ''),
                        'nickname'  => $row['nickname'] ?? null,
                        'avatarUrl' => $av,
                        'phone'     => $row['phone'] ?? null,
                        'createdAt' => conv_date($row['createdAt'] ?? null),
                        'updatedAt' => conv_date($row['updatedAt'] ?? null),
                    ];
                    if ($r['openid'] === '') { $skipped++; break; }
                    insert_row('user_info', $r); $ok++;
                    break;
            }
        } catch (Throwable $e) {
            $bad++;
            fwrite(STDERR, "  ⚠ 第 " . ($ok + $skipped + $bad) . " 行报错: " . $e->getMessage() . "\n");
        }
    }
    fclose($fh);
    echo "  完成：成功 $ok / 跳过脏数据 $skipped / 错误 $bad\n";
}

echo "\n✅ 全部迁移完成。检查无误后请：\n";
echo "   rm migrate.php\n";
echo "   rm -rf migrations/\n";

function insert_row(string $table, array $row): void {
    $cols  = array_keys($row);
    $place = implode(',', array_fill(0, count($cols), '?'));
    // INSERT IGNORE 让脚本可以重复跑（第二次 _id 冲突会自动跳过）
    $sql = "INSERT IGNORE INTO $table (" . implode(',', $cols) . ") VALUES ($place)";
    db()->prepare($sql)->execute(array_values($row));
}
