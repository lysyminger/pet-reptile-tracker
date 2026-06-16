-- 内容安全：图片异步检测的待办/结果记录表
-- 上传图片时插入一条 pending；微信把检测结果推送到 /wx/callback 后更新 status。
-- status: pending（已提交待结果）| pass（安全）| risky（违规，头像已被清除）

CREATE TABLE IF NOT EXISTS media_check (
  trace_id   VARCHAR(64)  NOT NULL COMMENT '微信返回的唯一请求标识',
  openid     VARCHAR(64)  NOT NULL,
  media_url  VARCHAR(512) NOT NULL COMMENT '被检测图片的对外 URL',
  scene      TINYINT      NOT NULL DEFAULT 1 COMMENT '1资料 2评论 3论坛 4社交日志',
  status     VARCHAR(10)  NOT NULL DEFAULT 'pending',
  label      INT          NULL COMMENT '命中标签（100正常/20002色情等）',
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TIMESTAMP     NULL COMMENT '收到推送结果的时间',
  PRIMARY KEY (trace_id),
  KEY idx_url (media_url(191)),
  KEY idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
