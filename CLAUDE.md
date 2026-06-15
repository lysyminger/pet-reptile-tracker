# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**爬宠饲养记** (Pet Reptile) — a WeChat Mini Program for reptile pet care tracking. Users manage pet profiles, log feeding/weight/substrate changes, and get dynamic scheduling reminders.

**Tech Stack**: WeChat Mini Program (WXML/WXSS/JavaScript) + self-hosted REST API on Alibaba Cloud (PHP + MySQL + Nginx, all behind a domain like `api.yourdomain.com`). No npm build step — development is done entirely in WeChat DevTools.

> Historical note: This project originally ran on WeChat Cloud Development (云函数 + 云数据库 + 云存储). It was migrated to a self-hosted backend; see `plans/2h2g-wordpress-velvety-prism.md` for the migration design.

## Development Workflow

- **IDE**: WeChat DevTools (required). Import this repo directly.
- **No build step**: The mini program framework compiles WXML/WXSS directly. Edit files and DevTools hot-reloads (`compileHotReLoad` enabled in `project.private.config.json`).
- **API base URL**: configured in [utils/api.js](utils/api.js) — `BASE_URL` constant. Change this to your deployed `api.yourdomain.com` before running on real devices.
- **Server domain whitelist**: 公众平台 → 开发设置 → 服务器域名 must include your API domain for both `request合法域名` and `uploadFile合法域名`. Domain must be HTTPS and ICP filed.
- **Base library**: `3.15.1` (set in `project.private.config.json`).
- **Global enums**: `app.globalData.foodTypeOptions` and `app.globalData.substrateTypeOptions` are the canonical picker lists for feeding/substrate types — reference them rather than redefining per page.

## Database

MySQL database `pet_reptile`, accessed via the REST API (never directly from the mini program). 5 tables; tenant isolation is enforced server-side via the JWT `openid` claim:

| Table | Purpose | Key Fields |
|---|---|---|
| `pet_info` | Pet profiles | `_id` (VARCHAR pk), `user_openid`, `name`, `species`, `avatar` (https URL), `feed_interval`, `sub_interval`, `next_feed_date`, `next_sub_date` |
| `feed_logs` | Feeding check-ins | `_id`, `pet_id`, `feed_date`, `food_type`, `amount` |
| `weight_logs` | Weight measurements | `_id`, `pet_id`, `weight`, `record_date` |
| `substrate_logs` | Substrate changes | `_id`, `pet_id`, `change_date`, `sub_type` |
| `user_info` | User profiles | `openid` (pk), `nickname`, `avatarUrl` |

`_id` values are kept as VARCHAR(32) (UUID-style) so original IDs from the WeChat Cloud Development era can be preserved during migration. `created_at` is auto-populated by MySQL `CURRENT_TIMESTAMP` — never sent from the client.

## Architecture

### Pages (6 total, defined in `app.json`)

| Page | Path | Purpose |
|---|---|---|
| 首页 (Today) | `pages/index/index` | Today's tasks — feeding/substrate reminders with dynamic scheduling |
| 爱宠 (Pets) | `pages/pets/pets` | Pet list with cached data (10-min TTL) |
| 详情 (Detail) | `pages/pet-detail/pet-detail` | Pet detail view with Canvas-drawn weight chart (max 10 records) |
| 我的 (Mine) | `pages/mine/mine` | User profile and settings |
| 添加 (Add Pet) | `pages/add-pet/add-pet` | Create/edit pet form |
| 体重 (Weight) | `pages/weight-record/weight-record` | Weight entry form and history |

### Key Files

| File | Purpose |
|---|---|
| `app.js` | Global entry: `ensureLogin()` (delegates to `utils/api.js`), date utilities (`formatDate`, `dateDiff`, `dateAdd`) |
| `app.json` | Page routes, TabBar config (3 tabs: 今日/爱宠/我的), nav bar color `#4A9C7B` |
| `app.wxss` | Global styles with CSS variables and utility classes |
| `utils/api.js` | HTTP wrapper around the self-hosted REST API: auto JWT auth, 401-retry-with-relogin, multipart upload helper. `BASE_URL` constant is the deployment switch. |
| `utils/cache.js` | TTL-based local storage cache (pets: 10min, schedule: 5min, weight: 30min, history: 15min) |
| `utils/util.js` | Shared utilities: date helpers, validation, toast wrappers |

### Backend (`server/`, deployed to Alibaba Cloud)

The PHP backend lives in [`server/`](server/) in this repo and is deployed to Alibaba Cloud ECS (managed via 宝塔/BT panel). It is framework-less, hand-rolled PHP (no Composer, no dependencies):

- **`server/index.php`** — single front controller. All `/api/*` requests hit it; a flat `$routes` table `[METHOD, regex, file, handler]` dispatches to `routes/*.php`. `/auth/login` is the **only** unauthenticated endpoint — every other route calls `require_auth()` first, which sets `$GLOBALS['openid']`.
- **`server/config.php`** — parses `server/.env` (no dotenv lib) into an `env()` helper; installs JSON-only error/exception handlers so 500s never leak stack traces.
- **`server/lib/`** — `db.php` (singleton PDO over MySQL, `new_id()` for 32-hex UUIDs), `auth.php` (HS256 JWT sign/verify + `jscode2session`), `response.php` (`json_ok`/`json_error`, `request_body()`, and **`assert_pet_owned($petId, $openid)`** — the per-log ownership guard).
- **`server/routes/`** — one file per resource (pets, feed, weight, substrate, user, upload, auth).
- **`server/.env.example`** — config template; copy to `server/.env` on the server (never committed — see `.gitignore`).

**Auth flow**: `wx.login` code → `POST /auth/login` → `jscode2session` → `openid` → JWT signed with `JWT_SECRET` (HS256, server-issued, 30-day exp). The client stores the token; the server re-derives `openid` from the JWT on every request.

**Tenant isolation is two-layer**: writes stamp `openid` from the JWT (never client input); reads/writes of `*_logs` additionally call `assert_pet_owned()` to confirm the `pet_id` belongs to the caller (404 if missing, 403 if another user's).

Full deployment steps are in [`server/DEPLOY.md`](server/DEPLOY.md). Historical migration design: [plans/2h2g-wordpress-velvety-prism.md](C:/Users/30296/.claude/plans/2h2g-wordpress-velvety-prism.md) (outside repo).

#### Backend commands (run on the server, not locally)

There is no build/test/lint step — PHP runs under Nginx + PHP-FPM. The only script is the one-shot data migration:

```bash
php migrate.php   # imports databasejson/*.json (WeChat Cloud exports) into MySQL; delete after use
```

`databasejson/` (real user-data exports) and `server.zip` are git-ignored and must not be committed to this public repo.

### Components (`components/`)

- `pet-card/` and `feed-modal/` — Empty stubs, reserved for future use

## Core Business Logic

### Dynamic Scheduling (核心逻辑)
```
下次计划日期 = 实际打卡日期 + 频率天数
```
When a user checks in, the next scheduled date is computed from the actual check-in date plus the configured interval. This means missed days auto-adjust — no backlog accumulation.

### Home Page Status Display
- `next_date === today` → "今天需要喂食啦" (orange warning)
- `next_date < today` → "已逾期 X 天未喂食" (red alert)
- `next_date > today` → "距离下次还有 X 天" (green normal)

## Important Conventions

- **File naming**: Mixed — pages use kebab-case (`pet-detail`), some use camelCase. Follow existing patterns per directory.
- **Each page** has 4 files: `.wxml` (template), `.wxss` (styles), `.js` (logic), `.json` (page config).
- **Date format**: Always `YYYY-MM-DD` strings. Use `app.formatDate()`, `app.dateDiff()`, `app.dateAdd()` from `app.js`.
- **API access**: Always go through `utils/api.js` (`api.get/post/put/del/uploadFile`) — never call `wx.request` directly. The wrapper handles auth, 401 retry, and base URL.
- **User isolation**: The server derives `openid` from the JWT and stamps it onto every write. Never trust a client-supplied `user_openid` — and don't bother sending it; the server overrides.
- **Caching**: Use `utils/cache.js` for read-heavy data. Invalidate cache after write/delete operations.
- **Canvas charts**: Hand-drawn in `pet-detail` — no third-party chart library.
- **OpenID is permanent** (see `OPENID_PERSISTENT.md`): WeChat assigns a stable openid per user per mini program. The token + cached openid live in `wx.setStorageSync`; only the token expires (server-side, 30 days), not the openid mapping. Never wipe `auth_openid` on logout — only the token.
- **API list endpoints return arrays, item endpoints return objects**: `api.get('/pets')` → `[]`, `api.get('/pets/:id')` → `{}`. Pages should still defensively check `Array.isArray(res)` because network errors return undefined.
- **`dateAdd` guards against bad input**: pass a valid `YYYY-MM-DD` string and a numeric interval. The function logs and falls back to today's date when given `undefined`/`NaN` — don't rely on the fallback in business logic.

## Adding New Pages

1. Create a directory under `pages/` with 4 files: `.wxml`, `.wxss`, `.js`, `.json`
2. Register the path in `app.json` → `pages` array
3. Follow the existing page lifecycle: `Page({ data: {}, onLoad() {}, onShow() {} })`
