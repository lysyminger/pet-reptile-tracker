# 爬宠饲养记 - 小程序维护文档

> 📅 最后更新：2026-03-26  
> 📦 版本：1.0.0  
> 📍 项目路径：`D:\Development\wechatapp\Pet reptile`

---

## 📋 目录

1. [项目概述](#项目概述)
2. [技术架构](#技术架构)
3. [目录结构](#目录结构)
4. [数据库设计](#数据库设计)
5. [核心功能说明](#核心功能说明)
6. [开发指南](#开发指南)
7. [部署流程](#部署流程)
8. [常见问题](#常见问题)
9. [更新日志](#更新日志)

---

## 项目概述

### 产品定位
一款专为爬宠玩家设计的**轻量级、打卡式饲养记录工具**。

### 核心价值
- ✅ 解决玩家忘记喂食/换垫材时间的痛点
- ✅ 动态顺延日程（实际打卡日 + 频率 = 下次计划）
- ✅ 体重折线图可视化成长曲线
- ✅ 科学饲养反馈和养成成就感

### 运行环境
- 微信小程序（iOS/Android 双端微信）
- 微信云开发（免服务器部署）

---

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    微信小程序客户端                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  今日   │  │  爱宠   │  │  详情   │  │  我的   │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                   微信云开发平台                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  云数据库     │  │  云存储       │  │  云函数   │ │
│  │  (MongoDB)   │  │  (文件存储)   │  │ (Node.js) │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────┘
```

### 技术栈
| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | WXML/WXSS/JS | 微信小程序原生框架 |
| 图表 | Canvas | 原生 Canvas 绘制体重折线图 |
| 后端 | 微信云开发 | 免服务器部署 |
| 数据库 | 云数据库 | 类 MongoDB NoSQL |
| 存储 | 云存储 | 宠物头像等文件 |
| 鉴权 | 云函数 | 获取用户 openid |

---

## 目录结构

```
Pet reptile/
│
├── app.js                    # 全局入口（云开发初始化）
├── app.json                  # 全局配置（页面路由、TabBar）
├── app.wxss                  # 全局样式（主题色、通用类）
├── project.config.json       # 项目配置（IDE 用）
├── sitemap.json              # 搜索索引配置
│
├── pages/                    # 页面目录
│   ├── index/                # 首页（今日待办）
│   │   ├── index.wxml
│   │   ├── index.wxss
│   │   ├── index.js
│   │   └── index.json
│   │
│   ├── pets/                 # 宠物列表页
│   │   ├── pets.wxml
│   │   ├── pets.wxss
│   │   ├── pets.js
│   │   └── pets.json
│   │
│   ├── pet-detail/           # 宠物详情页（图表）
│   │   ├── pet-detail.wxml
│   │   ├── pet-detail.wxss
│   │   ├── pet-detail.js
│   │   └── pet-detail.json
│   │
│   ├── add-pet/              # 添加/编辑宠物
│   │   ├── add-pet.wxml
│   │   ├── add-pet.wxss
│   │   ├── add-pet.js
│   │   └── add-pet.json
│   │
│   ├── weight-record/        # 体重/打卡记录
│   │   ├── weight-record.wxml
│   │   ├── weight-record.wxss
│   │   ├── weight-record.js
│   │   └── weight-record.json
│   │
│   └── mine/                 # 我的页面
│       ├── mine.wxml
│       ├── mine.wxss
│       ├── mine.js
│       └── mine.json
│
├── components/               # 自定义组件（预留）
│   ├── pet-card/
│   └── feed-modal/
│
├── cloudfunctions/           # 云函数目录
│   └── getOpenid/            # 获取 openid
│       ├── index.js
│       ├── package.json
│       └── config.json
│
├── utils/                    # 工具函数
│   └── util.js
│
└── assets/                   # 静态资源
    └── images/               # 图片资源
        ├── default-pet.png   # 默认宠物头像
        ├── default-avatar.png # 默认用户头像
        └── *.png             # TabBar 图标
```

---

## 数据库设计

### 1. 宠物档案表 (`pet_info`)

| 字段名 | 类型 | 说明 | 备注 |
|--------|------|------|------|
| `_id` | String | 宠物唯一 ID | 主键（自动生成） |
| `user_openid` | String | 用户 openid | 关联具体用户 |
| `name` | String | 宠物昵称 | 例如：小黑 |
| `species` | String | 品种 | 例如：豹纹守宫 |
| `avatar` | String | 头像文件 ID | 云存储 fileID |
| `arrivalDate` | String | 到家日期 | YYYY-MM-DD |
| `initialWeight` | Number | 初始体重 (g) | |
| `feed_interval` | Number | 喂食频率 (天) | 例如：3 |
| `sub_interval` | Number | 垫材更换频率 (天) | 例如：15 |
| `next_feed_date` | String | 下次计划喂食日期 | 🌟首页判断核心 |
| `next_sub_date` | String | 下次换垫材日期 | 🌟首页判断核心 |
| `created_at` | Date | 创建时间 | 服务器时间 |

### 2. 喂食记录表 (`feed_logs`)

| 字段名 | 类型 | 说明 | 备注 |
|--------|------|------|------|
| `_id` | String | 记录唯一 ID | 主键 |
| `pet_id` | String | 宠物 ID | 外键 |
| `feed_date` | String | 实际打卡日期 | YYYY-MM-DD |
| `food_type` | String | 食物种类 | 杜比亚/乳鼠等 |
| `amount` | String | 喂食量/备注 | 选填 |
| `created_at` | Date | 记录生成时间 | |

### 3. 体重记录表 (`weight_logs`)

| 字段名 | 类型 | 说明 | 备注 |
|--------|------|------|------|
| `_id` | String | 记录唯一 ID | 主键 |
| `pet_id` | String | 宠物 ID | 外键 |
| `weight` | Number | 体重数值 (g) | |
| `record_date` | String | 测量日期 | YYYY-MM-DD |
| `created_at` | Date | 记录录入时间 | |

### 4. 垫材更换记录表 (`substrate_logs`)

| 字段名 | 类型 | 说明 | 备注 |
|--------|------|------|------|
| `_id` | String | 记录唯一 ID | 主键 |
| `pet_id` | String | 宠物 ID | 外键 |
| `change_date` | String | 更换日期 | YYYY-MM-DD |
| `sub_type` | String | 垫材种类 | 厨房纸/爬沙等 |
| `created_at` | Date | 记录生成时间 | |

---

## 核心功能说明

### 3.1 动态喂食打卡系统 ⚠️

#### 核心逻辑
```
下次计划日期 = 上一次实际打卡日期 + 喂食频率 (N 天)
```

#### 场景示例
假设设定**每 3 天喂一次**：
- 原计划 3 号喂 → 用户忘记
- 实际 4 号才打卡 → 系统自动计算 `4 + 3 = 7`
- 下次计划更新为 **7 号**（而非 6 号）

#### 代码实现
```javascript
// pages/index/index.js - 确认打卡
async confirmFeed() {
  const { currentPetId, feedDate } = this.data;
  
  // 1. 添加喂食记录
  await this.addFeedRecord(currentPetId, feedDate, foodType, amount);
  
  // 2. 获取宠物信息
  const pet = await this.getPet(currentPetId);
  
  // 3. 计算下次日期（核心逻辑）
  const nextDate = app.dateAdd(feedDate, pet.feed_interval);
  
  // 4. 更新宠物档案
  await this.updatePet(currentPetId, { next_feed_date: nextDate });
}
```

### 3.2 首页状态判断

| 状态 | 条件 | 显示文案 | 样式 |
|------|------|----------|------|
| 正常待办 | `next_date === today` | "今天需要喂食啦" | 橙色警告 |
| 逾期提醒 | `next_date < today` | "已逾期 X 天未喂食" | 红色警示 |
| 清闲状态 | `next_date > today` | "距离下次还有 X 天" | 绿色正常 |

### 3.3 体重折线图

#### 技术实现
- 使用原生 `Canvas` 绘制（无需第三方库）
- 最多显示最近 10 条记录
- 平滑曲线 + 渐变填充

#### 绘制流程
```
1. 获取 Canvas 节点 → 2. 设置 DPR 缩放 → 3. 计算坐标映射
→ 4. 绘制网格线 → 5. 绘制折线 → 6. 绘制渐变填充
→ 7. 绘制数据点 → 8. 绘制坐标标签
```

### 3.4 防误触机制

#### 撤销功能（待实现）
- 打卡后 **10 分钟内** 可撤销
- 或 **当天内** 可删除
- 删除后日程状态回滚

---

## 开发指南

### 环境准备

1. **安装微信开发者工具**
   - 下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
   - 选择稳定版（Stable Build）

2. **导入项目**
   - 打开开发者工具
   - 导入项目 → 选择 `D:\Development\wechatapp\Pet reptile`
   - 填入自己的 AppID（或使用测试号）

3. **开通云开发**
   - 工具栏 → 云开发 → 开通
   - 创建环境（免费版即可）
   - 复制环境 ID 到 `app.js`

### 配置修改

#### app.js - 云环境 ID
```javascript
wx.cloud.init({
  env: 'your-env-id',  // 替换为你的云环境 ID
  traceUser: true
});
```

#### project.config.json - AppID
```json
{
  "appid": "your-appid",  // 替换为你的小程序 AppID
  "projectname": "pet-reptile"
}
```

### 云函数部署

1. 右键 `cloudfunctions/getOpenid` 目录
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成（状态变为 ✔）

### 数据库初始化

在云开发控制台创建以下集合：
- `pet_info`
- `feed_logs`
- `weight_logs`
- `substrate_logs`

#### 设置索引
```javascript
// pet_info
{ user_openid: 1 }
{ next_feed_date: 1 }
{ next_sub_date: 1 }

// feed_logs
{ pet_id: 1, feed_date: -1 }

// weight_logs
{ pet_id: 1, record_date: -1 }

// substrate_logs
{ pet_id: 1, change_date: -1 }
```

### 调试技巧

#### 1. 模拟数据（开发测试）
```javascript
// pages/index/index.js - getPets()
if (!wx.cloud) {
  // 模拟数据
  resolve({
    data: [
      {
        _id: 'test1',
        name: '测试宠物',
        species: '豹纹守宫',
        next_feed_date: '2026-03-26',
        next_sub_date: '2026-04-01'
      }
    ]
  });
  return;
}
```

#### 2. 清除缓存
```
工具栏 → 清缓存 → 清除全部缓存
```

#### 3. 真机预览
```
工具栏 → 预览 → 扫码在手机上查看
```

---

## 部署流程

### 1. 代码上传
1. 微信开发者工具 → 右上角 **上传**
2. 填写版本号和备注
3. 上传成功后在 **版本管理** 查看

### 2. 提交审核
1. 版本管理 → 开发版本 → 提交审核
2. 填写审核信息：
   - 功能介绍：爬宠饲养记录工具
   - 测试账号：（如有需要）
   - 补充说明：无社交/支付功能

### 3. 发布上线
1. 审核通过后 → 版本管理 → 生产版本
2. 点击 **发布**
3. 用户端即可搜索到小程序

### 4. 备案与认证

#### 小程序备案
- 个人主体：免费，需身份证
- 时间：3-7 个工作日
- 流程：基本信息 → 主营类目 → 腾讯审核 → 管局备案

#### 小程序认证
- 个人：30 元/年
- 企业：300 元/年
- 认证后才可分享和搜索

---

## 常见问题

### Q1: 云开发初始化失败
**A:** 检查以下几点：
1. 云环境 ID 是否正确
2. 是否已开通云开发服务
3. 云函数是否已部署

### Q2: 获取 openid 失败
**A:** 
1. 确认 `getOpenid` 云函数已部署
2. 检查云函数权限配置
3. 查看云函数日志排查错误

### Q3: Canvas 图表不显示
**A:**
1. 检查 `canvas-id` 是否匹配
2. 确保在 `onReady` 生命周期获取节点
3. 真机调试时注意 DPR 缩放

### Q4: 日期计算偏差
**A:**
1. 统一使用 `YYYY-MM-DD` 字符串格式
2. 避免时区问题（服务器时间 vs 本地时间）
3. 使用工具函数 `app.formatDate()`

### Q5: 数据查询超过 20 条限制
**A:** 云数据库单次查询最多返回 20 条，需分页：
```javascript
const db = wx.cloud.database();
const MAX_LIMIT = 20;

// 分批获取
const batch1 = await db.collection('feed_logs')
  .skip(0).limit(MAX_LIMIT).get();
const batch2 = await db.collection('feed_logs')
  .skip(MAX_LIMIT).limit(MAX_LIMIT).get();
```

### Q6: 打卡时提示 "喂食频率设置无效"
**A:** 检查以下几点：
1. 宠物档案是否正确设置了 `feed_interval` 字段
2. 如果是老数据，可能在创建时未设置该字段
3. 解决方案：编辑宠物档案，重新保存频率设置
4. 或者在云开发控制台手动添加 `feed_interval` 字段（数字类型）

### Q7: 显示 "NaN-NaN-NaN 天" 或日期异常
**A:** 
1. 此问题已在 v1.0.7 修复
2. 如果是旧数据导致，在云开发控制台检查 `next_feed_date` 字段
3. 删除异常的日期字段，重新打卡生成正确日期
4. 建议升级到最新版本

---

## 更新日志

### v1.0.7 (2026-04-06)
- ✅ 修复日期计算 NaN 问题（`dateAdd` 函数参数验证）
- ✅ 修复首页打卡无响应问题（`getPet` 返回值结构修复）
- ✅ 添加 `feed_interval` 和 `sub_interval` 有效性验证
- ✅ 增强待办列表类型兼容性（String 比较）
- ✅ 添加详细调试日志（便于问题排查）
- ✅ WXML 显示防御处理（避免显示 "NaN-NaN-NaN 天"）

#### 🔧 Bug 修复详情

**问题 1: 逾期后打卡显示 "NaN-NaN-NaN 天"**
- **原因**: `dateAdd` 函数未验证参数，当 `days` 为 `undefined/null` 时返回 `NaN`
- **修复**: 添加参数验证，无效时返回当前日期或原日期
- **文件**: `app.js`, `pages/index/index.js`, `pages/index/index.wxml`

**问题 2: 首页打卡按钮点击后提示 "喂食频率设置无效"**
- **原因**: `getPet` 方法返回整个云数据库响应对象，而非 `data` 字段
- **修复**: `getPet` 方法改为返回 `res.data`，正确获取宠物字段
- **文件**: `pages/index/index.js`

---

### v1.0.6 (2026-03-27 21:12)
- ✅ 修复删除后缓存刷新问题
- ✅ 删除记录后重新计算下次日期
- ✅ 删除后强制刷新前一页数据
- ✅ 首页/pets 页 onShow 强制刷新
- ✅ 删除所有记录后清空下次日期

### v1.0.5 (2026-03-27 20:54)
- ✅ 实现混合缓存方案（本地缓存 + 关键操作刷新）
- ✅ 创建统一缓存管理工具（utils/cache.js）
- ✅ 宠物列表缓存 10 分钟
- ✅ 日程数据缓存 5 分钟
- ✅ 体重记录缓存 30 分钟
- ✅ 打卡/删除后自动清除相关缓存
- ✅ 预计节省 75% 数据库读取次数

### v1.0.4 (2026-03-27 20:44)
- ✅ 当前体重显示优化（无记录时显示初始体重）
- ✅ 新建宠物完全不设置下次日期
- ✅ 只有打卡后才设置并显示对应日程
- ✅ 体重图表初始值正确显示

### v1.0.3 (2026-03-27 20:39)
- ✅ 优化日程显示逻辑
- ✅ 新建宠物不显示下次日程（未设置）
- ✅ 打卡后才显示对应提醒（喂食/垫材）
- ✅ "下次提醒"区域动态显示条目
- ✅ 首页待办只在打卡后显示

### v1.0.2 (2026-03-27 20:30)
- ✅ 优化下次日期计算逻辑
- ✅ 编辑宠物档案时不重置下次日期
- ✅ 只有新建和打卡时才计算下次日期

### v1.0.1 (2026-03-27)
- ✅ 新增删除功能（喂食/垫材/体重记录）
- ✅ 历史记录支持删除操作
- ✅ 删除前二次确认保护
- ✅ 删除后自动刷新数据
- 📁 建立文档管理规范（`docs/` 文件夹）

### v1.0.0 (2026-03-26)
- ✅ 初始版本发布
- ✅ 宠物档案管理（增删改查）
- ✅ 动态喂食打卡系统
- ✅ 垫材更换提醒
- ✅ 体重记录与折线图
- ✅ 首页待办事项
- ✅ 数据导出功能

### 待开发功能
- [ ] 打卡撤销功能（10 分钟内）
- [ ] 多宠物批量打卡
- [ ] 饲养日记/相册
- [ ] 温度/湿度记录
- [ ] 数据报表（月/周统计）
- [ ] 提醒通知（订阅消息）
- [ ] 社区分享功能

---

## 📞 技术支持

- 微信开放文档：https://developers.weixin.qq.com/miniprogram/dev/
- 云开发文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
- 问题反馈：项目 Issues

---

_最后更新：2026-03-26 22:50_
