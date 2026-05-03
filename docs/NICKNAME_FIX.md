# 昵称唯一索引问题修复

## ❌ 问题原因

### 错误信息
```
Error: collection.doc:fail -1 . docId must not be empty
```

### 原因分析

1. **退出登录时清空了 openid**
   ```javascript
   // app.js
   logout() {
     this.globalData.openid = null;  // ← 清空了
   }
   ```

2. **保存时使用 `doc(openid)` 需要 openid 不为空**
   ```javascript
   // ❌ 错误：openid 为空时会报错
   db.collection('user_info').doc(openid).set({...})
   ```

3. **设置了 nickname 唯一索引**
   - 不能使用 `doc(nickname)` 因为用户可能想改昵称
   - 应该使用 `openid` 作为用户标识（不唯一，可查询）

---

## ✅ 修复方案

### 1. 改用 `where + add/update` 方式

**修改前（错误）：**
```javascript
// ❌ openid 为空会报错
db.collection('user_info').doc(openid).set({
  data: userData
});
```

**修改后（正确）：**
```javascript
// ✅ 先查询是否存在
const res = await db.collection('user_info')
  .where({ openid: openid })
  .get();

if (res.data.length > 0) {
  // 已存在，更新
  db.collection('user_info')
    .doc(res.data[0]._id)
    .update({ data: userData });
} else {
  // 不存在，创建
  db.collection('user_info').add({
    data: userData
  });
}
```

---

### 2. 加载用户信息也改用 `where`

**修改前（错误）：**
```javascript
// ❌ openid 为空会报错
db.collection('user_info').doc(openid).get();
```

**修改后（正确）：**
```javascript
// ✅ 通过 where 查询
db.collection('user_info')
  .where({ openid: openid })
  .get();
```

---

### 3. 增加 openid 验证

**保存前检查：**
```javascript
const openid = app.globalData.openid;
if (!openid) {
  wx.showToast({ title: '登录信息丢失，请重试', icon: 'none' });
  return;
}
```

---

## 📦 数据库结构

### user_info 集合

```javascript
{
  _id: "自动生成",  // ← 数据库自动生成
  openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",  // ← 用户标识
  nickname: "蜜瓜的铲屎官",  // ← 唯一索引
  createdAt: Date,
  updatedAt: Date
}
```

### 索引设置

| 字段 | 索引类型 | 说明 |
|------|---------|------|
| `openid` | 普通索引 | 加速查询 |
| `nickname` | **唯一索引** | 防止重复（可选） |

**注意：** 如果设置 nickname 唯一索引，用户不能修改昵称。建议：
- ✅ 方案 A：不设置唯一索引（推荐）
- ⚠️ 方案 B：设置唯一索引，但不允许修改昵称

---

## 🎯 完整流程

### 首次保存

```
用户输入昵称
  ↓
检查 openid 是否存在
  ↓
查询数据库：where({ openid })
  ↓
不存在 → add()
  ↓
保存成功
```

### 再次登录

```
打开小程序
  ↓
自动获取 openid
  ↓
查询数据库：where({ openid })
  ↓
存在 → 加载 userInfo
  ↓
显示昵称
```

### 退出登录

```
点击退出
  ↓
清空本地数据
  ↓
清空 openid
  ↓
显示登录弹窗
```

### 重新登录

```
输入相同昵称
  ↓
获取 openid（同一个微信）
  ↓
查询数据库：where({ openid })
  ↓
存在 → 更新 nickname
  ↓
恢复数据
```

---

## ✅ 已修改的代码

### 1. pages/mine/mine.js - 保存方法

```javascript
async onSaveUserInfo() {
  const { tempNickname } = this.data;
  
  // 验证昵称
  if (!tempNickname || tempNickname.trim() === '') {
    wx.showToast({ title: '请输入昵称', icon: 'none' });
    return;
  }
  
  // 验证 openid
  const openid = app.globalData.openid;
  if (!openid) {
    wx.showToast({ title: '登录信息丢失，请重试', icon: 'none' });
    return;
  }
  
  const db = wx.cloud.database();
  
  // 查询是否已存在
  const existRes = await db.collection('user_info')
    .where({ openid: openid })
    .get();
  
  const userData = {
    openid: openid,
    nickname: tempNickname.trim(),
    updatedAt: db.serverDate()
  };
  
  if (existRes.data.length > 0) {
    // 更新
    await db.collection('user_info')
      .doc(existRes.data[0]._id)
      .update({ data: userData });
  } else {
    // 创建
    userData.createdAt = db.serverDate();
    await db.collection('user_info').add({
      data: userData
    });
  }
  
  // 更新页面
  this.setData({
    userInfo: userData,
    hasUserInfo: true,
    showLoginModal: false
  });
}
```

### 2. pages/mine/mine.js - 加载方法

```javascript
async loadUserInfoFromDB() {
  if (!wx.cloud || !app.globalData.openid) {
    this.setData({ hasUserInfo: false, showLoginModal: true });
    return;
  }
  
  const db = wx.cloud.database();
  
  // 通过 openid 查询
  const res = await db.collection('user_info')
    .where({ openid: app.globalData.openid })
    .get();
  
  if (res.data.length > 0 && res.data[0].nickname) {
    this.setData({
      userInfo: res.data[0],
      hasUserInfo: true
    });
  } else {
    this.setData({ hasUserInfo: false, showLoginModal: true });
  }
}
```

### 3. pages/mine/mine.wxss - 输入框样式

```css
.input-field {
  background-color: var(--bg-color);
  border-radius: 12rpx;
  padding: 28rpx 32rpx;  /* 增大内边距 */
  font-size: 32rpx;      /* 增大字体 */
  width: 100%;
  box-sizing: border-box;
  min-height: 88rpx;     /* 最小高度 */
  border: 2rpx solid var(--border-color);
}

.input-field:focus {
  border-color: var(--primary-color);
  background-color: #FFFFFF;
}
```

---

## ⚠️ 关于 nickname 唯一索引

### 建议：不要设置唯一索引

**原因：**
1. 用户可能想修改昵称
2. 同一个微信（openid）应该始终关联同一个用户
3. 通过 openid 已经可以唯一标识用户

**推荐做法：**
- `openid` 字段：普通索引（加速查询）
- `nickname` 字段：**不设置索引**或普通索引（不唯一）

### 如果坚持要唯一索引

**后果：**
- 用户不能修改昵称
- 同一个昵称只能被一个用户使用
- 需要处理昵称冲突（提示用户换一个）

---

## 🧪 测试流程

### 1. 首次登录

```
编译 → 我的 → 输入昵称 → 保存
验证：
- 显示昵称 ✅
- 数据库中有记录 ✅
```

### 2. 退出登录

```
点击"退出登录" → 确认
验证：
- 显示登录弹窗 ✅
- openid 已清空 ✅
```

### 3. 重新登录

```
再次输入昵称 → 保存
验证：
- 显示相同昵称 ✅
- 数据恢复 ✅
```

---

_最后更新：2026-03-27_
