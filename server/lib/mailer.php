<?php
declare(strict_types=1);

/**
 * 极简 SMTP 发信（SSL/TLS，QQ 邮箱 465）。仅用于发送验证码/密码重置邮件。
 *
 * 配置全部取自 .env，授权码只存服务器、不进客户端、不进仓库：
 *   SMTP_HOST=smtp.qq.com
 *   SMTP_PORT=465
 *   SMTP_USER=xxxx@qq.com
 *   SMTP_PASS=授权码（非QQ密码）
 *   SMTP_FROM=xxxx@qq.com
 *
 * 纯新增、零第三方依赖，不影响任何现有接口。
 */

function smtp_log(string $m): void {
    error_log('[smtp] ' . $m);
}

/** 发送一封 HTML 邮件，成功返回 true，失败返回 false（错误进 error_log）。 */
function send_mail(string $to, string $subject, string $htmlBody): bool {
    $host = env('SMTP_HOST', 'smtp.qq.com');
    $port = (int)env('SMTP_PORT', '465');
    $user = env('SMTP_USER');
    $pass = env('SMTP_PASS');
    $from = env('SMTP_FROM', $user);
    if ($user === '' || $pass === '') {
        smtp_log('missing SMTP_USER / SMTP_PASS in .env');
        return false;
    }

    $remote = ($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        smtp_log("connect fail: $errno $errstr ($remote)");
        return false;
    }
    stream_set_timeout($fp, 15);

    // 读取一条 SMTP 响应（支持多行：第 4 字符为 '-' 表示后续还有行）
    $read = function () use ($fp): string {
        $data = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        return $data;
    };
    $cmd = function (string $c) use ($fp, $read): string {
        fwrite($fp, $c . "\r\n");
        return $read();
    };
    $is = function (string $resp, string $code): bool {
        return strncmp($resp, $code, 3) === 0;
    };
    $bail = function (string $why) use ($fp): bool {
        smtp_log($why);
        @fclose($fp);
        return false;
    };

    if (!$is($read(), '220')) {
        return $bail('no 220 greeting');
    }
    if (!$is($cmd('EHLO petgrow.local'), '250')) {
        return $bail('EHLO rejected');
    }
    if (!$is($cmd('AUTH LOGIN'), '334')) {
        return $bail('AUTH LOGIN rejected');
    }
    if (!$is($cmd(base64_encode($user)), '334')) {
        return $bail('username rejected');
    }
    if (!$is($cmd(base64_encode($pass)), '235')) {
        return $bail('auth failed (检查授权码)');
    }
    if (!$is($cmd('MAIL FROM:<' . $from . '>'), '250')) {
        return $bail('MAIL FROM rejected');
    }
    if (!$is($cmd('RCPT TO:<' . $to . '>'), '250')) {
        return $bail('RCPT TO rejected');
    }
    if (!$is($cmd('DATA'), '354')) {
        return $bail('DATA rejected');
    }

    $headers = [
        'From: =?UTF-8?B?' . base64_encode('蜕变记') . '?= <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    // 正文整体 base64，规避点行(.)与行长限制，无需手动 dot-stuffing
    $payload = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($htmlBody));
    fwrite($fp, $payload . "\r\n.\r\n");
    if (!$is($read(), '250')) {
        return $bail('message not accepted');
    }
    $cmd('QUIT');
    @fclose($fp);
    return true;
}
