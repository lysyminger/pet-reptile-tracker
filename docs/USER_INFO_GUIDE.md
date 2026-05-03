# 微信用户信息获取指南

## 📋 信息类型对比

| 信息类型 | 获取方式 | 费用 | 是否推荐 |
|---------|---------|------|---------|
| **OpenID** | 云函数自动获取 | 免费 | ✅ 必用 |
| **头像/昵称** | 用户手动填写 | 免费 | ✅ 推荐 |
| **手机号** | 用户授权 | 0.03 元/次 | ⚠️ 谨慎使用 |

---

## 🔑 OpenID（免费）

### 获取方式
通过云函数 `getOpenid` 自动获取，无需用户授权。

### 代码位置
```
cloudfunctions/getOpenid/index.js
```

### 使用场景
- 用户唯一标识
- 数据库关联主键
- 权限验证

---

## 🖼️ 头像/昵称（免费）

### 获取方式
使用微信官方组件，用户**手动选择**头像和**输入**昵称。

### 代码位置
```
pages/mine/mine.wxml
- open-type="chooseAvatar" 选择头像
- input 输入昵称
```

### 数据保存
保存到 `user_info` 集合：
```javascript
{
  _id: "openid",
  nickname: "用户昵称",
  avatarUrl: "cloud://..."
}
```

### 注意事项
- ❌ 不能再通过 `wx.getUserInfo` 直接获取
- ✅ 必须用户主动选择/输入
- ✅ 可以保存到数据库重复使用

---

## 📱 手机号（收费）

### 费用说明
- **0.03 元/次** 验证
- 用户每次点击授权都会扣费
- 即使获取失败也会扣费

### 获取方式
```xml
<button open-type="getPhoneNumber" bindgetphonenumber="onGetPhoneNumber">
  绑定手机号
</button>
```

### 云函数解密
```javascript
// cloudfunctions/getPhoneNumber/index.js
const res = await cloud.getOpenData({
  list: [cloudID]
});
```

### 使用建议
| 场景 | 建议 |
|------|------|
| 个人小程序 | ❌ 不建议（省钱） |
| 企业小程序 | ✅ 可以（有预算） |
| 必需手机号 | ✅ 必须（如外卖、快递） |
| 可选功能 | ❌ 不需要（如宠物记录） |

### 替代方案
**让用户手动输入手机号：**
```xml
<input placeholder="输入手机号" type="number" bindinput="onPhoneInput" />
<button bindtap="savePhone">保存</button>
```

---

## 📦 数据库结构

### user_info 集合

```javascript
{
  _id: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",  // openid（主键）
  openid: "oq_6W65Xe7jm_EL6UVXZNcwHcayo",
  nickname: "蜜瓜的铲屎官",
  avatarUrl: "cloud://pet-xxx.avatars/user.png",
  phone: "138****1234",  // 可选
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🚀 部署步骤

### 1. 创建数据库集合
```
云开发控制台 → 数据库 → 添加集合
集合名称：user_info
```

### 2. 设置权限
```
用户创建：仅用户可读写
其他用户：仅可读（可选）
```

### 3. 部署云函数
```
右键 cloudfunctions/getPhoneNumber
→ 上传并部署：云端安装依赖
```

### 4. 测试流程
```
1. 打开"我的"页面
2. 点击"选择头像" → 选择图片
3. 输入昵称 → 点击"保存信息"
4. （可选）点击"绑定手机号" → 授权
5. 查看数据库 user_info 集合
```

---

## ⚠️ 注意事项

### 头像上传
- 头像会上传到云存储
- 路径：`avatars/{openid}_{timestamp}.png`
- 注意云存储容量限制（免费版 5GB）

### 手机号授权
- 每次点击都会扣费
- 建议添加确认弹窗
- 可以考虑手动输入替代

### 用户隐私
- 需要《用户隐私保护指引》
- 在小程序后台配置
- 说明收集哪些信息、用途

---

## 💰 费用估算

### 免费版额度
| 项目 | 额度 | 说明 |
|------|------|------|
| 云数据库 | 2GB 存储 | 约 10 万用户信息 |
| 云存储 | 5GB 存储 | 约 1 万张头像 |
| 云函数 | 10 万次调用 | 充足 |
| 手机号验证 | 无免费额度 | 0.03 元/次 |

### 建议
- **OpenID**：随便用（免费）
- **头像昵称**：随便用（免费）
- **手机号**：能不用就不用（省钱）

---

## ✅ 最佳实践

### 推荐方案（省钱）
```
1. OpenID：自动获取（必选）
2. 头像昵称：用户填写（可选）
3. 手机号：不收集（省钱）
```

### 完整方案（企业）
```
1. OpenID：自动获取
2. 头像昵称：用户填写
3. 手机号：用户授权（有预算）
```

---

_最后更新：2026-03-27_
