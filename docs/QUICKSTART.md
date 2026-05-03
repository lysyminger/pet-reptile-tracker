# 🚀 快速启动指南

> 5 分钟完成小程序初始化配置

---

## 第一步：打开项目

1. 启动 **微信开发者工具**
2. 导入项目 → 选择目录：`D:\Development\wechatapp\Pet reptile`

---

## 第二步：配置 AppID

打开 `project.config.json`，修改：

```json
{
  "appid": "your-appid"  // ← 替换为你的小程序 AppID
}
```

> 💡 没有 AppID？可使用**测试号**或**公众号 AppID**

---

## 第三步：开通云开发

1. 工具栏 → **云开发** 按钮
2. 首次使用会提示开通 → 点击**开通**
3. 创建环境（选择**免费版**即可）
4. 复制**环境 ID**（类似：cloud1-xxx）

---

## 第四步：配置云环境

打开 `app.js`，修改：

```javascript
wx.cloud.init({
  env: 'your-env-id',  // ← 替换为你的云环境 ID
  traceUser: true
});
```

---

## 第五步：部署云函数

1. 在开发者工具左侧文件树找到 `cloudfunctions/getOpenid`
2. **右键** → 选择 **上传并部署：云端安装依赖**
3. 等待部署完成（文件夹图标变为 ✔）

---

## 第六步：初始化数据库

在**云开发控制台**创建以下集合：

1. 点击 **数据库** → **添加集合**
2. 依次创建：
   - `pet_info`
   - `feed_logs`
   - `weight_logs`
   - `substrate_logs`

### 设置索引（可选但推荐）

在每个集合中点击 **索引** → **添加索引**：

**pet_info 集合：**
```
user_openid (升序)
next_feed_date (升序)
next_sub_date (升序)
```

**feed_logs 集合：**
```
pet_id (升序)
feed_date (降序)
```

**weight_logs 集合：**
```
pet_id (升序)
record_date (降序)
```

---

## 第七步：准备图标资源

在 `assets/images/` 目录放置以下图标（或使用默认占位图）：

### TabBar 图标（81x81px PNG）
- `today.png` / `today-active.png`
- `pets.png` / `pets-active.png`
- `mine.png` / `mine-active.png`

### 默认头像
- `default-pet.png` (宠物默认头像)
- `default-avatar.png` (用户默认头像)

> 💡 临时测试可跳过此步，小程序会使用内置占位图

---

## 第八步：编译运行

1. 点击工具栏 **编译** 按钮
2. 查看模拟器效果
3. 点击 **预览** → 扫码在真机测试

---

## ✅ 验证清单

- [ ] 项目成功导入，无报错
- [ ] AppID 已配置
- [ ] 云开发已开通
- [ ] 云环境 ID 已配置
- [ ] `getOpenid` 云函数已部署（✔）
- [ ] 4 个数据库集合已创建
- [ ] 点击编译无错误

---

## 🎉 完成！

现在你可以：

1. **添加宠物** → 点击"爱宠"Tab → 添加新宠物
2. **喂食打卡** → 首页待办事项 → 点击打卡
3. **记录体重** → 宠物详情 → 记录体重 → 查看成长曲线

---

## 📞 遇到问题？

### 常见错误及解决方案

| 错误信息 | 解决方案 |
|---------|---------|
| 云开发未初始化 | 检查 `app.js` 中的环境 ID |
| 获取 openid 失败 | 确认云函数已部署成功 |
| 数据库操作失败 | 检查集合名称是否正确 |
| Canvas 不显示 | 真机预览测试，模拟器可能不兼容 |

### 获取帮助

- 查看完整文档：`README.md`
- 微信开放社区：https://developers.weixin.qq.com/community/
- 云开发文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html

---

_祝你开发顺利！🦎_
