# 用户数据隔离方案

## ✅ 已实现：每个用户的数据完全独立

### 核心机制：通过 `openid` 隔离

每个微信用户有唯一的 `openid`，所有数据都通过 `openid` 进行过滤，确保用户之间数据完全隔离。

---

## 📦 数据库集合结构

### 1. user_info（用户信息）

```javascript
{
  _id: "自动生成",
  openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",  // 用户唯一标识
  nickname: "蜜瓜的铲屎官",
  avatarUrl: "cloud://...",
  createdAt: Date,
  updatedAt: Date
}
```

**查询方式：**
```javascript
db.collection('user_info').doc(openid).get()
```

---

### 2. pet_info（宠物档案）

```javascript
{
  _id: "自动生成",
  user_openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",  // 🔑 关键字段
  name: "蜜瓜",
  species: "睫角守宫",
  feed_interval: 3,
  sub_interval: 15,
  next_feed_date: "2026-03-30",
  next_sub_date: "2026-04-15",
  createdAt: Date
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

### 3. feed_logs（喂食记录）

```javascript
{
  _id: "自动生成",
  pet_id: "宠物 ID",  // 关联 pet_info._id
  feed_date: "2026-03-26",
  food_type: "杜比亚",
  amount: "3 只",
  createdAt: Date
}
```

**查询方式：**
```javascript
// 先获取用户的宠物 ID 列表
const pets = await db.collection('pet_info')
  .where({ user_openid: openid })
  .get();
const petIds = pets.data.map(p => p._id);

// 查询这些宠物的喂食记录
db.collection('feed_logs')
  .where({ pet_id: db.command.in(petIds) })
  .get()
```

---

### 4. weight_logs（体重记录）

```javascript
{
  _id: "自动生成",
  pet_id: "宠物 ID",
  weight: 35.5,
  record_date: "2026-03-26",
  createdAt: Date
}
```

**查询方式：** 同 `feed_logs`

---

### 5. substrate_logs（垫材记录）

```javascript
{
  _id: "自动生成",
  pet_id: "宠物 ID",
  change_date: "2026-03-26",
  sub_type: "厨房纸",
  createdAt: Date
}
```

**查询方式：** 同 `feed_logs`

---

## 🔐 数据隔离流程

```
用户 A 登录
  ↓
获取 openid_A
  ↓
查询宠物：{ user_openid: openid_A }
  ↓
只显示用户 A 的宠物
  ↓
查询记录：{ pet_id: [用户 A 的宠物 ID 列表] }
  ↓
只显示用户 A 的宠物记录
```

---

## ✅ 已修改的代码位置

### 1. pages/index/index.js
```javascript
// ✅ 已添加 user_openid 过滤
db.collection('pet_info')
  .where({ user_openid: app.globalData.openid })
  .get()
```

### 2. pages/pets/pets.js
```javascript
// ✅ 已添加 user_openid 过滤
db.collection('pet_info')
  .where({ user_openid: app.globalData.openid })
  .get()
```

### 3. pages/mine/mine.js
```javascript
// ✅ 已修改：先获取用户宠物，再查询记录
const pets = await db.collection('pet_info')
  .where({ user_openid: openid })
  .get();
const petIds = pets.data.map(p => p._id);

db.collection('feed_logs')
  .where({ pet_id: db.command.in(petIds) })
  .get()
```

### 4. pages/pet-detail/pet-detail.js
```javascript
// ✅ 通过 petId 查询（petId 已经属于当前用户）
db.collection('pet_info').doc(this.data.petId).get()
```

### 5. pages/add-pet/add-pet.js
```javascript
// ✅ 保存时添加 user_openid
const petData = {
  user_openid: app.globalData.openid,
  name: petName,
  // ...
};
db.collection('pet_info').add({ data: petData })
```

### 6. pages/weight-record/weight-record.js
```javascript
// ✅ 通过 petId 查询（petId 已经属于当前用户）
db.collection('pet_info').doc(this.data.petId).get()
```

---

## 🎯 数据库权限设置

### 推荐设置

在云开发控制台 → 数据库 → 权限设置：

| 集合 | 权限 | 说明 |
|------|------|------|
| `user_info` | 所有用户可读写 | 通过 openid 隔离 |
| `pet_info` | 所有用户可读写 | 通过 user_openid 过滤 |
| `feed_logs` | 所有用户可读写 | 通过 pet_id 关联 |
| `weight_logs` | 所有用户可读写 | 通过 pet_id 关联 |
| `substrate_logs` | 所有用户可读写 | 通过 pet_id 关联 |

### 高级安全设置（可选）

如果需要更严格的安全控制，可以使用自定义规则：

```javascript
// pet_info 集合权限规则
{
  "read": "auth.openid == resource.user_openid",
  "write": "auth.openid == resource.user_openid"
}
```

这样即使代码忘记过滤，数据库层面也会阻止访问其他用户的数据。

---

## 📊 数据关系图

```
user_info (openid: user_A)
    ↓
pet_info (user_openid: user_A)
    ├─ pet_1
    ├─ pet_2
    └─ pet_3
         ↓
    feed_logs (pet_id: pet_3)
    weight_logs (pet_id: pet_3)
    substrate_logs (pet_id: pet_3)
```

---

## ✅ 测试验证

### 测试步骤

1. **创建两个测试账号**
   - 账号 A：登录 → 添加宠物"蜜瓜"
   - 账号 B：登录 → 添加宠物"小强"

2. **验证数据隔离**
   - 账号 A 查看宠物列表 → 只显示"蜜瓜"
   - 账号 B 查看宠物列表 → 只显示"小强"
   - 账号 A 查看喂食记录 → 只显示"蜜瓜"的记录
   - 账号 B 查看喂食记录 → 只显示"小强"的记录

3. **验证导出数据**
   - 账号 A 导出 → 只有"蜜瓜"的数据
   - 账号 B 导出 → 只有"小强"的数据

---

## ⚠️ 注意事项

### 1. 必须使用 openid 过滤

所有查询宠物相关的操作都必须添加：
```javascript
.where({ user_openid: app.globalData.openid })
```

### 2. 记录表通过 pet_id 关联

喂食/体重/垫材记录通过 `pet_id` 关联，间接实现用户隔离。

### 3. 云函数也要验证

如果添加云函数，记得在云函数中也要验证 `openid`：
```javascript
const openid = cloud.getWXContext().OPENID;
db.collection('pet_info').where({ user_openid: openid }).get()
```

---

## 📋 总结

| 功能 | 实现方式 | 状态 |
|------|---------|------|
| **用户信息隔离** | openid 作为文档 ID | ✅ |
| **宠物数据隔离** | user_openid 字段过滤 | ✅ |
| **记录数据隔离** | 通过 pet_id 间接隔离 | ✅ |
| **导出数据隔离** | 先过滤用户宠物 | ✅ |
| **数据库权限** | 所有用户可读写（代码层隔离） | ✅ |

---

_最后更新：2026-03-27_
