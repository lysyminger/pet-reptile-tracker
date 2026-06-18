-- 鸿蒙端账号密码登录所需的库结构变更（纯新增，对现有微信用户无影响）
-- 在阿里云 MySQL 库 pet_reptile 执行一次（phpMyAdmin / 宝塔 / mysql 客户端）。
-- username / password_hash 对微信用户保持 NULL，微信登录链路完全不变。
--
-- 注意：若线上已执行过（鸿蒙登录已可用），重复执行会报 "Duplicate column"，忽略即可。

ALTER TABLE user_info
  ADD COLUMN username      VARCHAR(64)  NULL,
  ADD COLUMN password_hash VARCHAR(255) NULL;

-- 用户名唯一索引（MySQL 允许多行 NULL，微信用户不受约束）
ALTER TABLE user_info
  ADD UNIQUE INDEX uniq_user_info_username (username);
