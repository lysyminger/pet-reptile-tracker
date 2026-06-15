# 爬宠饲养记 🦎

> 一款专为爬宠玩家设计的**轻量级、打卡式饲养记录**微信小程序。
> 记录喂食、体重、垫材更换，按实际打卡日动态顺延下次提醒，告别"忘记喂食"。

---

## 目录

- [产品概述](#产品概述)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [后端部署](#后端部署)
- [数据库设计](#数据库设计)
- [REST API](#rest-api)
- [核心业务逻辑](#核心业务逻辑)
- [开发约定](#开发约定)
- [常见问题](#常见问题)
- [更新日志](#更新日志)

---

## 产品概述

### 核心价值

- ✅ 解决玩家忘记喂食 / 换垫材时间的痛点
- ✅ **动态顺延日程**：实际打卡日 + 频率 = 下次计划日，缺漏自动校正、不堆积
- ✅ 体重折线图（Canvas 手绘）可视化成长曲线
- ✅ 多宠物档案管理，按用户隔离

### 运行环境

- 微信小程序（iOS / Android 双端微信）
- 自建 REST 后端（阿里云 ECS + 宝塔 + PHP + MySQL + Nginx）

---

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    微信小程序客户端                        │
│   今日待办 │ 爱宠列表 │ 宠物详情(图表) │ 添加 │ 体重 │ 我的  │
│                  (WXML / WXSS / 原生 JS)                  │
└───────────────────────────┬─────────────────────────────┘
                            │  HTTPS + JWT
                            │  (utils/api.js 统一封装)
                            ▼
┌─────────────────────────────────────────────────────────┐
│            阿里云 ECS (宝塔面板管理)                       │
│   Nginx  →  PHP REST API  →  MySQL (pet_reptile)         │
│                  ↑                                        │
│          wx.login code → jscode2session → openid → JWT    │
│   /uploads/  ← 宠物头像等文件存储                          │
└─────────────────────────────────────────────────────────┘
```

> **历史说明**：本项目最初运行于微信云开发（云函数 + 云数据库 + 云存储），后迁移至自建后端。迁移设计见 `plans/` 目录与 `server/DEPLOY.md`。

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | WXML / WXSS / 原生 JS | 微信小程序原生框架，无 npm 构建步骤 |
| 图表 | Canvas | 原生 Canvas 手绘体重折线图，无第三方库 |
| 网络 | `utils/api.js` | HTTP 封装：自动 JWT、401 重登重试、文件上传 |
| 缓存 | `utils/cache.js` | 基于本地存储的 TTL 缓存 |
| 后端 | PHP（无框架） | 单入口 `index.php` + 正则路由表 |
| 数据库 | MySQL `pet_reptile` | 5 张表，服务端按 JWT openid 做租户隔离 |
| 鉴权 | 自签 JWT | HMAC-SHA256，服务端 30 天有效 |
| 存储 | Nginx 静态目录 `/uploads/` | 宠物头像（HTTPS URL） |

---

## 目录结构

```
Pet reptile/
├── app.js                  # 全局入口：ensureLogin()、日期工具
├── app.json                # 页面路由、TabBar（今日/爱宠/我的）、导航色 #4A9C7B
├── app.wxss                # 全局样式（CSS 变量、通用类）
│
├── pages/                  # 6 个页面，每个含 .wxml/.wxss/.js/.json
│   ├── index/              #   今日待办（喂食/垫材动态提醒）
│   ├── pets/               #   爱宠列表（10 分钟缓存）
│   ├── pet-detail/         #   宠物详情 + Canvas 体重图
│   ├── add-pet/            #   新建 / 编辑宠物
│   ├── weight-record/      #   体重录入与历史
│   └── mine/               #   个人中心
│
├── components/             # pet-card / feed-modal（预留空壳）
│
├── utils/
│   ├── api.js              # 自建后端 HTTP 封装（BASE_URL 为部署开关）
│   ├── cache.js            # TTL 本地缓存
│   └── util.js             # 日期、校验、toast 等共享工具
│
├── server/                 # 自建后端（部署到阿里云）
│   ├── index.php           #   单入口控制器 + 路由表
│   ├── config.php          #   从 .env 加载配置
│   ├── .env.example        #   环境变量模板（复制为 .env 填实际值）
│   ├── migrate.php         #   云开发 JSON 导出 → MySQL 灌库脚本
│   ├── nginx-snippet.conf  #   Nginx 重写规则片段
│   ├── DEPLOY.md           #   分步部署指南
│   ├── lib/                #   db.php / auth.php / response.php
│   └── routes/             #   auth / pets / feed / weight / substrate / upload / user
│
├── assets/                 # 图标与默认头像
└── docs/                   # 维护文档
```

> `databasejson/`（云开发数据导出）与 `server.zip` 含真实用户数据 / 构建产物，**已被 `.gitignore` 排除**，不进仓库。

---

## 快速开始

### 1. 前端（小程序）

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（Stable Build），基础库 `3.15.1`。
2. 导入本仓库目录，填入自己的小程序 AppID（或测试号）。
3. 编辑 [`utils/api.js`](utils/api.js) 的 `BASE_URL`，指向你部署的后端域名：
   ```js
   const BASE_URL = 'https://api.yourdomain.com/api';
   ```
4. 在 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 开发设置 → 服务器域名，把该域名加入
   `request` / `uploadFile` / `downloadFile` 合法域名（须 HTTPS 且已 ICP 备案）。
5. 编译预览即可。无构建步骤，DevTools 热重载。

### 2. 后端

见下方 [后端部署](#后端部署) 或 [`server/DEPLOY.md`](server/DEPLOY.md)。

---

## 后端部署

完整分步说明见 [`server/DEPLOY.md`](server/DEPLOY.md)，概要：

1. **准备**：阿里云 ECS + 宝塔，域名已建站、SSL 强制 HTTPS、MySQL 建库 `pet_reptile` 与 5 张表。
2. **上传**：把 `server/` 内全部文件传到站点根目录（如 `/www/wwwroot/api.yourdomain.com/`），删掉宝塔默认 `index.html`。
3. **配置**：复制 `.env.example` 为 `.env`，填入 `WX_APPID / WX_APPSECRET / JWT_SECRET / DB_* / UPLOAD_URL_PREFIX`，并把 `.env` 权限设为 `600`。
   `JWT_SECRET` 用 `openssl rand -hex 32` 生成。
4. **Nginx**：把 `nginx-snippet.conf` 内容插入站点 `server { }` 块。
5. **（可选）数据迁移**：若从云开发迁移，上传导出 JSON，执行 `php migrate.php`，确认无误后删除 `migrate.php` 与迁移数据目录。
6. **自测**：
   ```bash
   curl -i https://api.yourdomain.com/api/pets        # 期望 401
   curl -i https://api.yourdomain.com/api/nonexistent # 期望 404
   ```

> ⚠️ `.env`、真实数据库密码、用户数据导出 **不要提交到仓库**。`.gitignore` 已覆盖 `*.env`、`databasejson/`、`*.zip`。

---

## 数据库设计

MySQL 库 `pet_reptile`，仅经 REST API 访问（小程序不直连）。`_id` 为 `VARCHAR(32)` UUID 风格，以便保留云开发时期的原始 ID；`created_at` 由 MySQL `CURRENT_TIMESTAMP` 自动填充，客户端不发送。

| 表 | 用途 | 关键字段 |
|---|---|---|
| `pet_info` | 宠物档案 | `_id`(pk), `user_openid`, `name`, `species`, `avatar`(https), `feed_interval`, `sub_interval`, `next_feed_date`, `next_sub_date` |
| `feed_logs` | 喂食打卡 | `_id`, `pet_id`, `feed_date`, `food_type`, `amount` |
| `weight_logs` | 体重记录 | `_id`, `pet_id`, `weight`, `record_date` |
| `substrate_logs` | 垫材更换 | `_id`, `pet_id`, `change_date`, `sub_type` |
| `user_info` | 用户资料 | `openid`(pk), `nickname`, `avatarUrl` |

**租户隔离**：服务端从 JWT 的 `openid` claim 推导身份，写入时强制盖章——绝不信任客户端传来的 `user_openid`。

---

## REST API

所有接口前缀 `/api`，除登录外均需 `Authorization: Bearer <token>`。列表接口返回数组，单项接口返回对象。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | `wx.login` code 换 JWT（唯一免鉴权接口） |
| GET / POST | `/user` | 获取 / 更新当前用户资料 |
| GET / POST | `/pets` | 宠物列表 / 新建 |
| GET / PUT / DELETE | `/pets/:id` | 宠物详情 / 更新 / 删除 |
| GET / POST | `/feed-logs` | 喂食记录列表 / 新建 |
| GET | `/feed-logs/count` | 喂食次数统计 |
| GET / DELETE | `/feed-logs/:id` | 单条 / 删除 |
| GET / POST | `/weight-logs` | 体重记录列表 / 新建 |
| GET / DELETE | `/weight-logs/:id` | 单条 / 删除 |
| GET / POST | `/substrate-logs` | 垫材记录列表 / 新建 |
| GET | `/substrate-logs/count` | 垫材更换统计 |
| GET / DELETE | `/substrate-logs/:id` | 单条 / 删除 |
| POST | `/uploads` | 文件上传（头像），返回 https URL |

---

## 核心业务逻辑

### 动态顺延日程（核心）

```
下次计划日期 = 实际打卡日期 + 频率天数
```

用户打卡时，下次日期从**实际打卡日**而非原计划日计算——因此缺漏的天数会自动校正，不会累积待办。

```js
// 打卡确认后
const nextDate = app.dateAdd(feedDate, pet.feed_interval);
await api.put(`/pets/${petId}`, { next_feed_date: nextDate });
```

### 首页状态判断

| 条件 | 文案 | 样式 |
|------|------|------|
| `next_date === today` | 今天需要喂食啦 | 🟠 橙色警告 |
| `next_date < today` | 已逾期 X 天未喂食 | 🔴 红色警示 |
| `next_date > today` | 距离下次还有 X 天 | 🟢 绿色正常 |

### 体重折线图

原生 Canvas 手绘，最多展示最近 10 条记录，含网格、平滑折线、渐变填充与坐标标签，无第三方图表库。

---

## 开发约定

- **API 访问**：一律走 [`utils/api.js`](utils/api.js)（`api.get/post/put/del/uploadFile`），不直接调 `wx.request`。封装已处理鉴权、401 重登重试与 base URL。
- **日期格式**：统一 `YYYY-MM-DD` 字符串，用 `app.formatDate()` / `app.dateDiff()` / `app.dateAdd()`。
- **OpenID 持久**：openid 永久稳定，仅 token 会过期（服务端 30 天）。登出只清 token，**不清 `auth_openid`**（详见 `OPENID_PERSISTENT.md`）。
- **缓存**：读多写少数据用 `utils/cache.js`，写 / 删后及时失效缓存。
- **返回值防御**：列表接口期望数组，但网络异常会返回 `undefined`，页面仍应 `Array.isArray()` 检查。
- **全局枚举**：`app.globalData.foodTypeOptions` / `substrateTypeOptions` 为喂食 / 垫材类型的唯一来源，勿在各页重复定义。

### 新增页面

1. 在 `pages/` 下建目录，含 `.wxml` / `.wxss` / `.js` / `.json` 四件套。
2. 在 `app.json` 的 `pages` 数组注册路径。
3. 遵循 `Page({ data, onLoad, onShow })` 生命周期。

---

## 常见问题

**Q：接口全部 401？**
确认 `BASE_URL` 正确、`wx.login` 能拿到 code、服务端 `WX_APPID/WX_APPSECRET` 配对、`JWT_SECRET` 已设置。

**Q：头像上传后不显示？**
检查 `UPLOAD_URL_PREFIX` 指向 `/uploads/` 且域名在 `downloadFile` 合法域名白名单内。

**Q：日期显示 `NaN-NaN-NaN`？**
确保传给 `dateAdd` 的是合法 `YYYY-MM-DD` 字符串与数字频率；旧脏数据需在数据库修正 `next_feed_date`。

**Q：服务器报 500？**
看宝塔「网站日志」。错误以 JSON 返回不暴露堆栈，详细信息在 `error_log`。

---

## 更新日志

### v2.2.0 — 头像圆形裁剪
- 🖼️ 上传头像新增裁剪页（`pages/avatar-cropper/`）：Canvas 2D + 自处理拖动 / 双指缩放，圆形裁剪框，导出圆形 PNG
- 🔁 `add-pet` 选图后经裁剪页 `eventChannel` 回传再上传

### v2.1.0 — 自定义昵称
- ✨ "我的"页支持点击昵称修改，实时同步到后端 `user_info.nickname`
- 🔔 新增版本更新提示弹窗（`utils/whatsNew.js`，每个版本仅弹一次，发版改版本号即自动再弹）
- 🧹 清理无用的旧昵称弹层代码（`onSaveUserInfo` / `tempNickname` / `showLoginModal`）

### v2.0.0 — 迁移至自建后端
- 🚀 从微信云开发迁移到阿里云自建 REST 后端（PHP + MySQL + Nginx）
- ➕ 新增 `server/`（单入口路由、JWT 鉴权、文件上传）、`utils/api.js` HTTP 封装
- 🗑️ 移除 `cloudfunctions/`（getOpenid / getPhoneNumber / quickstartFunctions）
- 🔁 各页面数据访问改为统一走 `utils/api.js`

### v1.0.7（2026-04-06）
- 修复 `dateAdd` 参数未校验导致的 `NaN` 日期
- 修复首页打卡无响应（`getPet` 返回结构）
- 新增 `feed_interval` / `sub_interval` 有效性校验

### v1.0.x（2026-03）
- 混合缓存方案（本地缓存 + 关键操作刷新，`utils/cache.js`）
- 记录删除与二次确认、删除后日程回滚
- 日程显示逻辑优化（仅打卡后显示下次提醒）

### v1.0.0（2026-03-26）
- 初始版本：宠物档案增删改查、动态喂食打卡、垫材提醒、体重折线图、首页待办

### 待开发
- [ ] 打卡撤销（10 分钟内）
- [ ] 多宠物批量打卡
- [ ] 温湿度记录
- [ ] 数据报表（周 / 月统计）
- [ ] 订阅消息提醒

---

## 技术支持

- [微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/)
- 问题反馈：本仓库 Issues
