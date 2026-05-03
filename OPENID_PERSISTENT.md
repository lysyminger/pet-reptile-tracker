# OpenID 持久化方案

## 🎯 核心问题

**用户问：** "退出登录后，再登录怎么保证是同一个 openid？"

---

## ✅ 解决方案

### OpenID 的本质

| 特性 | 说明 |
|------|------|
| **来源** | 微信自动分配（类似身份证号） |
| **唯一性** | 每个微信用户对同一个小程序有唯一 openid |
| **持久性** | **不会改变**（除非用户注销微信账号） |
| **获取方式** | 通过云函数自动获取（用户无感知） |

### 关键理解

```
❌ 错误理解：
"退出登录 = 清空 openid，下次重新获取"

✅ 正确理解：
"openid = 用户身份证，永远不应该清空"
"退出登录 = 只是隐藏 UI，数据仍在云端"
```

---

## 📋 实现方案

### 1. 每次启动自动获取 openid

**app.js：**
```javascript
App({
  onLaunch() {
    // 小程序启动时自动获取 openid
    this.getOpenid();
  },
  
  onShow() {
    // 从后台回到前台，确保 openid 存在
    if (!this.globalData.openid) {
      this.getOpenid();
    }
  },
  
  globalData: {
    openid: null  // 存储 openid
  }
});
```

### 2. 退出登录不清空 openid

**修改前（错误）：**
```javascript
// ❌ 清空 openid，导致无法找回数据
logout() {
  this.globalData.openid = null;
}
```

**修改后（正确）：**
```javascript
// ✅ 不清空 openid，只清空 UI 状态
doLogout() {
  this.setData({
    userInfo: {},
    hasUserInfo: false,
    showLoginModal: true  // 显示登录弹窗
  });
  
  // app.globalData.openid 保持不变 ✅
}
```

### 3. 数据关联流程

```
用户首次打开小程序
  ↓
自动获取 openid（微信分配，固定不变）
  ↓
输入昵称 → 保存到数据库
{
  openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",
  nickname: "蜜瓜的铲屎官"
}
  ↓
添加宠物 → 关联 openid
{
  user_openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",
  name: "蜜瓜"
}
  ↓
退出登录 → 只清空 UI，openid 保留
  ↓
再次打开小程序
  ↓
自动获取 openid（同一个微信，相同的 openid）
  ↓
查询数据库 → 恢复所有数据 ✅
```

---

## 🔐 用户场景

### 场景 1：正常退出再登录

```
1. 用户 A 打开小程序 → 自动获取 openid_A
2. 输入昵称"蜜瓜的铲屎官" → 保存到数据库
3. 添加宠物"蜜瓜" → 关联 openid_A
4. 点击"退出登录" → 清空 UI，openid_A 保留
5. 再次打开 → 自动获取 openid_A（同一个）
6. 查询数据库 → 恢复"蜜瓜"的数据 ✅
```

### 场景 2：删除小程序再安装

```
1. 用户 A 打开小程序 → 自动获取 openid_A
2. 输入昵称，添加宠物
3. 删除小程序
4. 重新安装打开
5. 自动获取 openid_A（微信用户不变，openid 不变）
6. 查询数据库 → 恢复所有数据 ✅
```

### 场景 3：换微信账号

```
1. 用户 A 打开小程序 → openid_A
2. 输入昵称，添加宠物
3. 退出微信，登录用户 B 的微信
4. 打开小程序 → openid_B（不同的微信，不同的 openid）
5. 查询数据库 → 显示"请输入昵称"（新用户）
6. 输入昵称 → 创建新用户数据 ✅
```

---

## ⚠️ 关于"换号"问题

### 当前设计

**特点：**
- ✅ 一个微信账号 = 一个用户
- ✅ 数据自动关联，无需手动登录
- ✅ 删除小程序再安装，数据不丢失
- ❌ **不能主动切换账号**（因为 openid 固定）

### 如果需支持换号

**方案 A：微信切换账号**
```
1. 退出微信
2. 登录另一个微信账号
3. 打开小程序 → 自动获取新的 openid
4. 输入昵称 → 创建新用户
```

**方案 B：实现多账号系统（复杂，不推荐）**
```
1. 实现用户名密码登录
2. 或使用微信 unionid（跨应用统一标识）
3. 或实现账号绑定系统
```

**建议：** 对于个人小程序，**方案 A 足够**。

---

## 📊 数据库查询逻辑

### 查询用户信息

```javascript
// ✅ 通过 openid 查询（固定不变）
const res = await db.collection('user_info')
  .where({ openid: app.globalData.openid })
  .get();

// 结果：同一个微信用户，永远返回相同的数据
```

### 查询宠物信息

```javascript
// ✅ 通过 user_openid 查询（关联到 openid）
const pets = await db.collection('pet_info')
  .where({ user_openid: app.globalData.openid })
  .get();

// 结果：同一个微信用户的所有宠物
```

---

## 🧪 测试验证

### 测试 1：退出再登录

```
1. 打开小程序 → 输入昵称 → 添加宠物
2. 点击"退出登录"
3. 再次打开小程序
4. 验证：自动显示昵称和宠物 ✅
```

### 测试 2：删除再安装

```
1. 打开小程序 → 输入昵称 → 添加宠物
2. 删除小程序
3. 重新安装打开
4. 验证：数据自动恢复 ✅
```

### 测试 3：换微信账号

```
1. 微信 A → 打开小程序 → 添加数据
2. 退出微信 A，登录微信 B
3. 打开小程序
4. 验证：显示"请输入昵称"（新用户） ✅
5. 输入昵称 → 创建新数据
```

---

## ✅ 总结

### OpenID 特性

| 特性 | 说明 |
|------|------|
| **获取方式** | 自动获取（用户无感知） |
| **持久性** | 永久不变（除非注销微信） |
| **唯一性** | 一个微信 = 一个 openid |
| **清空后果** | 无法找回数据 ❌ |

### 正确做法

```javascript
// ✅ 每次启动自动获取
onLaunch() {
  this.getOpenid();
}

// ✅ 退出登录不清空 openid
doLogout() {
  this.setData({ hasUserInfo: false });
  // app.globalData.openid 保持不变
}

// ✅ 通过 openid 查询数据
db.collection('user_info')
  .where({ openid: app.globalData.openid })
  .get()
```

### 用户体验

```
用户认为：
"我输入昵称登录，数据自动保存"

实际实现：
"微信 openid 唯一标识，数据永久关联"
```

---

_最后更新：2026-03-27_
