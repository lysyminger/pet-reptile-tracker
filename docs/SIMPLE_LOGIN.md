# 简化登录与数据隔离方案

## ✅ 已实现功能

### 1. 简化登录流程

| 项目 | 修改前 | 修改后 |
|------|--------|--------|
| **必填项** | 昵称 + 头像 | 仅昵称 |
| **操作步骤** | 选择头像 → 输入昵称 → 保存 | 输入昵称 → 保存 |
| **用户体验** | 3 步 | 1 步 |

---

### 2. 登录流程

```
用户打开"我的"页面
  ↓
自动弹出"输入昵称"弹窗
  ↓
用户输入昵称（如：蜜瓜的铲屎官）
  ↓
点击"保存"
  ↓
保存到数据库 user_info 集合
  ↓
显示用户信息（昵称 + ID）
```

---

### 3. 数据隔离机制

#### 核心原理

**使用 openid 作为用户唯一标识**（后台自动获取，用户无感知）

```
微信用户 → 自动获取 openid → 关联所有数据
```

#### 数据关系

```
user_info (openid: user_A, nickname: "蜜瓜的铲屎官")
    ↓
pet_info (user_openid: user_A)
    ├─ 宠物 1
    ├─ 宠物 2
    └─ 宠物 3
         ↓
    feed_logs (pet_id: 宠物 3)
    weight_logs (pet_id: 宠物 3)
    substrate_logs (pet_id: 宠物 3)
```

---

## 📦 数据库集合

### user_info（用户信息）

```javascript
{
  _id: "自动生成（以 openid 为文档 ID）",
  openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",
  nickname: "蜜瓜的铲屎官",  // 唯一用户输入
  createdAt: Date,
  updatedAt: Date
}
```

**注意：** 
- ❌ 不再保存头像
- ✅ 只保存昵称
- ✅ openid 作为文档 ID（自动创建索引）

---

### pet_info（宠物档案）

```javascript
{
  _id: "自动生成",
  user_openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",  // 🔑 隔离关键字段
  name: "蜜瓜",
  species: "睫角守宫",
  ...
}
```

**查询方式：**
```javascript
// 只查询当前用户的宠物
db.collection('pet_info')
  .where({ user_openid: app.globalData.openid })
  .get()
```

---

### feed_logs / weight_logs / substrate_logs

```javascript
{
  _id: "自动生成",
  pet_id: "宠物 ID",  // 关联 pet_info._id
  ...
}
```

**查询方式：**
```javascript
// 先获取用户宠物 ID 列表
const pets = await db.collection('pet_info')
  .where({ user_openid: openid })
  .get();
const petIds = pets.data.map(p => p._id);

// 查询这些宠物的记录
db.collection('feed_logs')
  .where({ pet_id: db.command.in(petIds) })
  .get()
```

---

## 🎯 首页数据隔离

### 最近打卡（已修改）

**修改前：**
```javascript
// ❌ 查询所有记录（无隔离）
db.collection('feed_logs')
  .orderBy('feed_date', 'desc')
  .limit(5)
  .get()
```

**修改后：**
```javascript
// ✅ 只查询当前用户的记录
// 1. 获取用户宠物 ID 列表
const pets = await db.collection('pet_info')
  .where({ user_openid: openid })
  .get();
const petIds = pets.data.map(p => p._id);

// 2. 查询这些宠物的记录
db.collection('feed_logs')
  .where({ pet_id: db.command.in(petIds) })
  .orderBy('feed_date', 'desc')
  .limit(5)
  .get()
```

---

## 📊 已修改的代码位置

### 1. pages/mine/mine.wxml
- ✅ 移除头像选择按钮
- ✅ 移除头像预览
- ✅ 简化表单提示
- ✅ 修改登录按钮文字："输入昵称"

### 2. pages/mine/mine.js
- ✅ 移除 `tempAvatarUrl` 数据
- ✅ 移除 `onChooseAvatar` 方法
- ✅ 简化 `onSaveUserInfo` 方法（只保存昵称）
- ✅ 修改 `loadUserInfoFromDB` 逻辑（只检查昵称）

### 3. pages/mine/mine.wxss
- ✅ 移除头像相关样式
- ✅ 添加 `.hint-block` 提示样式
- ✅ 修改 `.user-header` 布局（无头像）

### 4. pages/index/index.js
- ✅ 修改 `getRecentRecords` 方法
- ✅ 添加 `user_openid` 过滤
- ✅ 通过宠物 ID 间接隔离记录

---

## ✅ 用户体验

### 首次使用

```
1. 打开小程序
2. 点击"我的"Tab
3. 自动弹出"输入昵称"弹窗
4. 输入昵称（如：蜜瓜的铲屎官）
5. 点击"保存"
6. 登录成功，显示昵称
```

### 再次使用

```
1. 打开小程序
2. 自动识别 openid
3. 从数据库加载昵称
4. 直接显示用户信息
5. 数据自动恢复
```

### 退出登录

```
1. 点击"退出登录"
2. 清空本地数据
3. 清空 openid
4. 再次打开需要重新输入昵称
```

---

## 🔐 数据隔离验证

### 测试场景

| 用户 | 昵称 | 宠物 | 验证 |
|------|------|------|------|
| 用户 A | 蜜瓜的铲屎官 | 蜜瓜、小强 | 只能看到自己的宠物 |
| 用户 B | 爬宠爱好者 | 阿呆 | 只能看到自己的宠物 |

### 验证方法

```
1. 用户 A 登录 → 添加宠物"蜜瓜"
2. 用户 A 退出登录
3. 用户 B 登录 → 添加宠物"阿呆"
4. 用户 B 查看：
   - 宠物列表：只有"阿呆" ✅
   - 首页待办：只有"阿呆"的任务 ✅
   - 最近打卡：只有"阿呆"的记录 ✅
```

---

## ⚠️ 注意事项

### 1. 昵称可以重复

**问题：** 多个用户可能使用相同昵称

**解决：** 
- ✅ 后台使用 openid 唯一标识
- ✅ 用户感知上是昵称登录
- ✅ 数据通过 openid 隔离，不会混淆

### 2. 退出登录后

**表现：**
- 本地数据清空
- openid 清空
- 再次登录需要重新输入昵称

**数据不会丢失：**
- 云端数据仍然保存
- 重新登录后（同一个微信）会自动恢复

### 3. 数据隔离级别

| 数据类型 | 隔离字段 | 级别 |
|---------|---------|------|
| 用户信息 | openid | 🔒 完全隔离 |
| 宠物档案 | user_openid | 🔒 完全隔离 |
| 喂食记录 | pet_id → user_openid | 🔒 完全隔离 |
| 体重记录 | pet_id → user_openid | 🔒 完全隔离 |
| 垫材记录 | pet_id → user_openid | 🔒 完全隔离 |

---

## 📋 总结

### 修改内容

| 功能 | 修改 | 状态 |
|------|------|------|
| **登录简化** | 移除头像，只输入昵称 | ✅ |
| **数据隔离** | 所有查询添加 openid 过滤 | ✅ |
| **首页隔离** | 最近打卡只显当前用户 | ✅ |
| **退出登录** | 清空 openid 和本地数据 | ✅ |

### 用户感知

```
用户认为：
"我输入昵称登录，数据自动恢复"

实际实现：
"微信 openid 唯一标识，数据通过 openid 隔离"
```

### 优点

- ✅ 登录简单（只需输入昵称）
- ✅ 数据安全（openid 隔离）
- ✅ 体验流畅（自动识别）
- ✅ 隐私保护（用户数据独立）

---

_最后更新：2026-03-27_
