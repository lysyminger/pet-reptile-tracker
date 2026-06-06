<?php
declare(strict_types=1);

function upload_file(): void {
    if (empty($_FILES['file'])) json_error('缺少 file 字段');
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) json_error('上传失败 code=' . $f['error']);
    if ($f['size'] > 5 * 1024 * 1024) json_error('文件过大，最大 5MB');

    // 用文件头魔数（magic bytes）识别图片类型，不依赖 fileinfo 扩展
    $ext = detect_image_ext($f['tmp_name']);
    if ($ext === null) {
        json_error('仅支持 JPG/PNG/GIF/WebP');
    }

    $dir = __DIR__ . '/../uploads';
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $filename = bin2hex(random_bytes(8)) . '_' . time() . '.' . $ext;
    $dest = $dir . '/' . $filename;

    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        json_error('保存失败', 500);
    }

    $url = rtrim(env('UPLOAD_URL_PREFIX'), '/') . '/' . $filename;
    json_ok(['url' => $url]);
}

// 读前 12 字节匹配图片格式签名，返回扩展名或 null
function detect_image_ext(string $tmpFile): ?string {
    $fh = @fopen($tmpFile, 'rb');
    if (!$fh) return null;
    $head = fread($fh, 12);
    fclose($fh);
    if ($head === false || strlen($head) < 4) return null;

    // JPEG: FF D8 FF
    if (substr($head, 0, 3) === "\xFF\xD8\xFF") return 'jpg';

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (substr($head, 0, 8) === "\x89PNG\r\n\x1A\n") return 'png';

    // GIF: "GIF87a" 或 "GIF89a"
    if (substr($head, 0, 6) === 'GIF87a' || substr($head, 0, 6) === 'GIF89a') return 'gif';

    // WebP: "RIFF" + 4 字节大小 + "WEBP"
    if (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') return 'webp';

    return null;
}
