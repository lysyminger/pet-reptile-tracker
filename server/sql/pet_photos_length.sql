-- 鸿蒙端相册「体长曲线」所需的可选列（纯新增）。
-- 在阿里云 MySQL 库 pet_reptile 执行一次。
-- 小程序从不读写该列；后端 photos.php 仅当此列存在且客户端传值时才写入，
-- 因此即便不执行本脚本，相册功能也完全正常，只是鸿蒙端体长不持久化。

ALTER TABLE pet_photos
  ADD COLUMN length_cm DECIMAL(6,2) NULL;
