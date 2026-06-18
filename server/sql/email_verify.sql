-- 邮箱验证码 / 找回密码（纯新增，不影响微信用户与现有表）
-- 1) user_info 加可空 email 列：微信用户为 NULL，行为不变
ALTER TABLE user_info ADD COLUMN email VARCHAR(128) NULL;
-- 可选：邮箱唯一（注册时已在应用层校验，这里加唯一索引更稳；已存在重复邮箱时会失败，可去掉 UNIQUE）
ALTER TABLE user_info ADD UNIQUE INDEX uniq_user_email (email);

-- 2) 验证码表：注册/找回都用，按 email + purpose 存，带过期与一次性标记
CREATE TABLE IF NOT EXISTS email_codes (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(128) NOT NULL,
  code        VARCHAR(8)   NOT NULL,
  purpose     VARCHAR(16)  NOT NULL,            -- 'register' | 'reset'
  expires_at  DATETIME     NOT NULL,
  used        TINYINT      NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL,
  INDEX idx_email_purpose (email, purpose),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
