# 部署指南

按顺序执行，每步约 1-3 分钟。

## 0. 准备

宝塔里你应该已经有：
- ✅ 域名 `api.lysyminger.online` 已建站，运行中
- ✅ SSL 已申请，强制 HTTPS 已开
- ✅ MySQL 库 `pet_reptile` + 5 张表已建好
- ✅ AppSecret 已重置，新值你手上有

如果有任何一项不对，先回头补齐。

---

## 1. 把 server/ 目录上传到服务器

**方式 A：宝塔文件管理器（推荐，最简单）**

1. 在本地把 `server/` 整个目录里**所有文件**打包成 zip（不要套一层 server 目录，要让里面的 `index.php` 在 zip 的根）
2. 宝塔 → 文件 → 进入 `/www/wwwroot/api.lysyminger.online/`
3. 点「上传」→ 把 zip 拖进去
4. 上传完点「解压」→ 选「解压到当前目录」
5. 删除上传的 zip 包

**方式 B：SFTP（如果你装了 FileZilla 之类）**

直接把 `server/` 内的所有文件传到 `/www/wwwroot/api.lysyminger.online/`。

最终目录长这样：

```
/www/wwwroot/api.lysyminger.online/
├── index.php
├── config.php
├── migrate.php
├── .env.example
├── nginx-snippet.conf
├── DEPLOY.md
├── lib/
├── routes/
└── uploads/         ← 这个目录会被自动创建，不创建也行
```

宝塔默认会有一个 `index.html` 欢迎页，**把它删掉**，避免它优先级高于 `index.php`。

---

## 2. 创建 .env 文件

宝塔文件管理器里：

1. 找到 `.env.example` → 右键 → 重命名 → 改成 `.env`
2. 双击 `.env` 编辑，填入实际值：
   ```
   WX_APPID=wx72f836c54512f38f
   WX_APPSECRET=你刚重置的新 AppSecret
   JWT_SECRET=<随便填 64 位字符串，下面有生成方法>
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=pet_reptile
   DB_USER=pet_reptile
   DB_PASS=<你的 MySQL 密码>
   UPLOAD_URL_PREFIX=https://api.lysyminger.online/uploads
   ```
3. **生成 JWT_SECRET**：进入宝塔的「终端」（顶栏右上角），运行：
   ```
   openssl rand -hex 32
   ```
   把输出的 64 位字符串粘到 `JWT_SECRET=` 后面。
4. 保存。
5. 右键 `.env` → 「权限」→ 设为 `600`（只有所有者读写）。

---

## 3. 修改 Nginx 配置

1. 宝塔 → 网站 → `api.lysyminger.online` → 设置 → 「配置文件」标签
2. 把 `nginx-snippet.conf` 里的内容**插入到 `server { ... }` 块内**（已存在的 SSL/log 之类的别动，添加在底部即可）
3. 保存。宝塔会自动 reload Nginx。如果保存时弹错误，仔细看哪一行红字提示，多半是花括号没对齐。

---

## 4. 把数据 JSON 传上去

1. 宝塔文件管理器进入 `/www/wwwroot/api.lysyminger.online/`
2. 新建目录 `migrations/data/`（已经在脚本里写死了这个路径）
3. 把本地 `databasejson/` 里的 5 个 JSON 文件上传到这里

---

## 5. 跑灌库脚本

宝塔顶栏 → 「终端」（或 SSH 上服务器），执行：

```
cd /www/wwwroot/api.lysyminger.online
php migrate.php
```

预期输出类似：

```
===== 处理 database_export-DMCGNmU4FAcn.json =====
  → 表: pet_info
  完成：成功 36 / 跳过脏数据 0 / 错误 0

===== 处理 database_export-ipGkaUAOFyqG.json =====
  → 表: feed_logs
  完成：成功 114 / 跳过脏数据 0 / 错误 0

===== 处理 database_export-3wEoZKtzxO_a.json =====
  → 表: weight_logs
  完成：成功 77 / 跳过脏数据 1 / 错误 0       ← 跳过的是那条 pet_id:"undefined"

===== 处理 database_export-a0iUxzUE1DBw.json =====
  → 表: substrate_logs
  完成：成功 36 / 跳过脏数据 0 / 错误 0

===== 处理 database_export-oUCKWH49qwmH.json =====
  → 表: user_info
  完成：成功 2 / 跳过脏数据 0 / 错误 0

✅ 全部迁移完成。
```

跑完去 phpMyAdmin 看每张表的「浏览」标签，行数对得上就 OK。

---

## 6. 清理迁移产物

跑完确认无误后：

```
cd /www/wwwroot/api.lysyminger.online
rm migrate.php
rm -rf migrations/
```

这两个东西放服务器上久了是攻击面，必须删。

---

## 7. 测试 API

终端里测最关键的 3 个 endpoint：

### 7.1 测一个不存在的接口（应该返回 401）

```
curl -i https://api.lysyminger.online/api/pets
```
预期：`HTTP/1.1 401 Unauthorized` + `{"error":"Unauthorized"}`。

### 7.2 测登录失败

```
curl -i -X POST https://api.lysyminger.online/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"fakecode"}'
```
预期：`HTTP/1.1 401` + `{"error":"微信登录失败: invalid code"}`。这说明 PHP 跑通了、能调微信 API、AppSecret 配对。

### 7.3 测 404

```
curl -i https://api.lysyminger.online/api/nonexistent
```
预期：`HTTP/1.1 404` + `{"error":"Not Found"}`。

**3 个测试都通过 = 后端 OK**。如果有报 500，去宝塔「网站日志」看具体错误。

---

## 8. 小程序后台加白名单

[mp.weixin.qq.com](https://mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → 服务器域名：

- **request 合法域名**：添加 `https://api.lysyminger.online`
- **uploadFile 合法域名**：添加 `https://api.lysyminger.online`
- **downloadFile 合法域名**：添加 `https://api.lysyminger.online`

每月只能改 5 次，一次改对。

---

## 9. 真机测试小程序

1. 开发者工具打开项目，点「真机调试」或「预览」扫码
2. 在手机上：
   - 进首页 → 看是否能加载到原来的宠物
   - 加一只新宠物 + 上传头像 → 看头像 URL 是不是 `https://api.lysyminger.online/uploads/xxx.jpg`
   - 喂食打卡 → 看首页待办是否刷新
   - 「我的」页 → 看统计数据是否正确

如果有问题，主要看 3 个地方：
- 开发者工具控制台的红色报错（小程序端的错）
- 宝塔「网站日志」（后端的错）
- phpMyAdmin 直接查表，看数据进了没

---

## 10. 灰度发布

测试无误后：
1. 开发者工具 → 上传 → 提审 → 发布
2. **微信云开发环境保留 2 周**，不要立刻关
3. 2 周后无投诉，去云开发控制台关掉环境
