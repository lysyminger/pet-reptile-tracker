# 退出登录功能说明

## ✅ 已实现功能

### 1. 退出登录按钮

**位置：** "我的"页面 → 功能列表最下方

**样式：** 红色背景，带退出图标 🚪

**操作：** 点击后弹出确认对话框

---

### 2. 退出登录流程

```
点击"退出登录"
  ↓
弹出确认对话框
"退出后需要重新登录才能查看数据"
  ↓
点击"退出"
  ↓
清空本地数据
  ↓
清空全局 openid
  ↓
清除缓存
  ↓
显示"已退出登录"
  ↓
页面刷新为未登录状态
```

---

### 3. 清空的数据

| 数据类型 | 清空内容 |
|---------|---------|
| **用户信息** | 头像、昵称、hasUserInfo |
| **统计数据** | 宠物数、喂食数、体重数、天数 |
| **全局状态** | app.globalData.openid |
| **本地缓存** | wx.removeStorageSync('userInfo') |

---

### 4. 退出后的表现

#### "我的"页面
```
❌ 用户信息卡片
→ 显示"欢迎使用爬宠饲养记"
→ 显示"微信一键登录"按钮

✅ 统计数据
→ 全部显示为 0

✅ 功能列表
→ 仍可访问（导出、备份等）
→ 但数据为空
```

#### "爱宠"页面
```
❌ 宠物列表
→ 显示空状态"还没有爱宠"
→ 因为查询条件 user_openid 为空

✅ 添加宠物按钮
→ 仍可点击
→ 但会提示需要先登录
```

#### "首页"
```
❌ 待办事项
→ 显示空状态

❌ 统计数据
→ 全部为 0
```

---

## 📋 代码实现

### 退出登录按钮（mine.wxml）

```xml
<view class="menu-item logout-item" bindtap="onLogout">
  <text class="menu-icon">🚪</text>
  <text class="menu-text logout-text">退出登录</text>
  <text class="menu-arrow">›</text>
</view>
```

### 退出逻辑（mine.js）

```javascript
// 点击退出
onLogout() {
  wx.showModal({
    title: '确认退出',
    content: '退出后需要重新登录才能查看数据',
    confirmText: '退出',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        this.doLogout();
      }
    }
  });
}

// 执行退出
doLogout() {
  // 清空本地数据
  this.setData({
    userInfo: {},
    hasUserInfo: false,
    stats: { petsCount: 0, feedCount: 0, ... }
  });
  
  // 清空全局 openid
  app.logout();
  
  // 清除缓存
  wx.removeStorageSync('userInfo');
  
  // 刷新页面
  this.loadUserData();
}
```

### 全局退出（app.js）

```javascript
logout() {
  this.globalData.openid = null;
  console.log('已退出登录，openid 已清空');
}
```

---

## 🎯 数据隔离验证

### 退出后查询

```javascript
// 宠物查询
db.collection('pet_info')
  .where({ user_openid: null })  // openid 为空
  .get()
// 结果：[] 空数组

// 用户信息查询
db.collection('user_info')
  .doc(null)  // openid 为空
  .get()
// 结果：不存在
```

---

## ✅ 测试流程

### 1. 登录状态测试

```
1. 点击"微信一键登录"
2. 填写昵称、选择头像
3. 点击"保存"
4. 查看统计数据（应该有数据）
5. 查看爱宠页面（应该有宠物）
```

### 2. 退出登录测试

```
1. 点击"退出登录"
2. 点击"退出"确认
3. 查看"我的"页面 → 显示登录按钮
4. 查看统计数据 → 全部为 0
5. 查看"爱宠"页面 → 显示空状态
6. 查看"首页" → 显示空状态
```

### 3. 重新登录测试

```
1. 再次点击"微信一键登录"
2. 填写信息并保存
3. 查看数据 → 应该恢复显示
```

---

## ⚠️ 注意事项

### 1. 数据不会删除

退出登录**只是清空本地状态**，云端数据仍然保存：

- `user_info` 集合中的用户信息
- `pet_info` 集合中的宠物数据
- `feed_logs` 等记录数据

**重新登录后，数据会恢复显示。**

### 2. openid 是关键

退出登录的核心是**清空 `app.globalData.openid`**：

```javascript
// 退出前
app.globalData.openid = "oq_6W65Xe7jm_EL6UVXZNcwHcayo"

// 退出后
app.globalData.openid = null
```

### 3. 页面刷新

退出后需要**刷新页面**才能看到未登录状态：

```javascript
this.loadUserData();  // 重新加载数据
```

---

## 📊 完善后的"我的数据"

### 统计逻辑

| 统计项 | 计算方式 | 说明 |
|--------|---------|------|
| **爱宠** | `pet_info.count()` | 用户的宠物数量 |
| **喂食** | `feed_logs.count()` | 所有宠物的喂食记录数 |
| **体重** | `weight_logs.count()` | 所有宠物的体重记录数 |
| **天数** | `最早宠物创建时间 → 今天` | 饲养天数 |

### 未登录状态

```
爱宠：0
喂食：0
体重：0
天数：0
```

### 已登录状态（示例）

```
爱宠：3
喂食：25
体重：18
天数：45
```

---

## 🎨 UI 样式

### 退出登录按钮

```css
.logout-item {
  background-color: #FFF5F5;  /* 浅红色背景 */
}

.logout-text {
  color: #E74C3C;  /* 红色文字 */
}
```

### 统计数据

```css
.stat-number {
  font-size: 40rpx;
  font-weight: bold;
  color: var(--primary-color);  /* 绿色数字 */
}

.stat-label {
  font-size: 24rpx;
  color: var(--text-hint);  /* 灰色标签 */
}
```

---

_最后更新：2026-03-27_
