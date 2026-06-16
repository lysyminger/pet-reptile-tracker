-- 宠物相册：每只宠物的图片
-- url=原图对外地址；thumb_url=缩略图(网格用)；caption=可选说明
CREATE TABLE IF NOT EXISTS pet_photos (
  _id        VARCHAR(64)  NOT NULL,
  pet_id     VARCHAR(64)  NOT NULL,
  url        VARCHAR(512) NOT NULL,
  thumb_url  VARCHAR(512) NULL,
  caption    VARCHAR(200) NULL,
  taken_at   DATETIME     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (_id),
  KEY idx_pet (pet_id, taken_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
