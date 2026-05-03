# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**爬宠饲养记** (Pet Reptile) — a WeChat Mini Program for reptile pet care tracking. Users manage pet profiles, log feeding/weight/substrate changes, and get dynamic scheduling reminders.

**Tech Stack**: WeChat Mini Program (WXML/WXSS/JavaScript) + WeChat Cloud Development (serverless). No npm build step — development is done entirely in WeChat DevTools.

## Development Workflow

- **IDE**: WeChat DevTools (required). Import this repo directly.
- **No build step**: The mini program framework compiles WXML/WXSS directly. Edit files and DevTools hot-reloads (`compileHotReLoad` enabled in `project.private.config.json`).
- **Cloud functions**: Right-click a cloud function folder in DevTools → "上传并部署：云端安装依赖" to deploy. Or use `uploadCloudFunction.sh`.
- **Cloud env ID**: `pet-8ghznjihef60f3e3` (configured in `app.js`).
- **Base library**: `3.15.1` (set in `project.private.config.json`).

## Database

Cloud Database (MongoDB-like). 5 collections, all keyed by `user_openid` for multi-tenant isolation:

| Collection | Purpose | Key Fields |
|---|---|---|
| `pet_info` | Pet profiles | `user_openid`, `name`, `species`, `avatar`, `feed_interval`, `sub_interval`, `next_feed_date`, `next_sub_date` |
| `feed_logs` | Feeding check-ins | `pet_id`, `feed_date`, `food_type`, `amount` |
| `weight_logs` | Weight measurements | `pet_id`, `weight`, `record_date` |
| `substrate_logs` | Substrate changes | `pet_id`, `change_date`, `sub_type` |
| `user_info` | User profiles | `openid`, `nickname`, `avatarUrl` |

**Important**: Single query limit is 20 rows — paginate with `.skip()`/`.limit()` for larger datasets.

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
| `app.js` | Global entry: cloud init, openid fetch, date utilities (`formatDate`, `dateDiff`, `dateAdd`) |
| `app.json` | Page routes, TabBar config (3 tabs: 今日/爱宠/我的), nav bar color `#4A9C7B` |
| `app.wxss` | Global styles with CSS variables and utility classes |
| `utils/cache.js` | TTL-based local storage cache (pets: 10min, schedule: 5min, weight: 30min, history: 15min) |
| `utils/util.js` | Shared utilities: date helpers, validation, toast wrappers |

### Cloud Functions (`cloudfunctions/`)

- `getOpenid` — Returns user's WeChat openid (identity key)
- `getPhoneNumber` — Decrypts user phone number
- `quickstartFunctions` — Template scaffold, unused

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
- **Cloud DB access**: Use `wx.cloud.database()` — never direct HTTP calls.
- **User isolation**: All queries must filter by `user_openid` to prevent cross-user data leakage.
- **Caching**: Use `utils/cache.js` for read-heavy data. Invalidate cache after write/delete operations.
- **Canvas charts**: Hand-drawn in `pet-detail` — no third-party chart library.

## Adding New Pages

1. Create a directory under `pages/` with 4 files: `.wxml`, `.wxss`, `.js`, `.json`
2. Register the path in `app.json` → `pages` array
3. Follow the existing page lifecycle: `Page({ data: {}, onLoad() {}, onShow() {} })`
