# 2026-04-06 打卡功能 Bug 修复

> 📅 修复日期：2026-04-06  
> 📦 版本：v1.0.7  
> 🔧 修复人：AI Assistant

---

## 📋 修复概述

本次修复解决了两个严重影响打卡功能的问题：
1. **日期计算 NaN 问题** - 逾期后打卡显示 "NaN-NaN-NaN 天"
2. **打卡无响应问题** - 首页打卡按钮点击后提示 "喂食频率设置无效"

---

## 🐛 问题 1: 日期计算 NaN 问题

### 问题描述
用户在逾期后添加喂食记录，首页显示 "NaN-NaN-NaN 天" 而不是正常的逾期天数。

### 根本原因
`app.js` 中的 `dateAdd` 函数未对参数进行验证：

```javascript
// ❌ 修复前
dateAdd(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);  // 如果 days 是 undefined，结果是 NaN
  return this.formatDate(d);       // 输出 "NaN-NaN-NaN"
}
```

当以下情况发生时触发：
- 新建宠物时 `feed_interval` 未设置（为 `undefined`）
- 数据库字段缺失或为 `null`
- 用户输入了无效的频率值

### 修复方案

**文件**: `app.js`

```javascript
// ✅ 修复后
dateAdd(date, days) {
  // 参数验证：确保 date 有效
  if (!date) {
    console.error('dateAdd: date 参数为空', date);
    return this.formatDate(new Date());
  }
  
  // 参数验证：确保 days 是有效数字
  const daysNum = parseInt(days);
  if (isNaN(daysNum)) {
    console.error('dateAdd: days 参数无效', days);
    return this.formatDate(new Date(date));
  }
  
  const d = new Date(date);
  // 验证日期是否有效
  if (isNaN(d.getTime())) {
    console.error('dateAdd: 日期格式无效', date);
    return this.formatDate(new Date());
  }
  
  d.setDate(d.getDate() + daysNum);
  return this.formatDate(d);
}
```

### 相关修复

**文件**: `pages/index/index.js` - `calculateTodoList` 方法

```javascript
// 添加 NaN 检测和防御性显示
if (pet.next_feed_date && pet.next_feed_date.indexOf('NaN') === -1 && pet.next_feed_date <= today) {
  const overdueDays = isOverdue ? Math.max(0, app.dateDiff(today, pet.next_feed_date)) : 0;
  // ...
}
```

**文件**: `pages/index/index.wxml`

```xml
<!-- 显示防御：避免显示 NaN -->
{{item.isOverdue ? (item.overdueDays ? '已逾期 ' + item.overdueDays + ' 天' : '已逾期') : '今日'}}

<!-- 下次日期显示 -->
下次：{{item.nextDate && item.nextDate.indexOf('NaN') === -1 ? item.nextDate : '未设置'}}
```

---

## 🐛 问题 2: 打卡无响应/频率无效

### 问题描述
用户点击首页打卡按钮后：
1. 弹窗正常显示
2. 填写信息后点击"确认打卡"
3. 提示 "宠物喂食频率设置无效"
4. 打卡失败

### 根本原因
`getPet` 方法返回了错误的对象结构：

```javascript
// ❌ 修复前
getPet(petId) {
  const db = wx.cloud.database();
  return db.collection('pet_info').doc(petId).get();
  // 返回：{ _id: "xxx", data: { feed_interval: 3, ... } }
}

// 后续代码访问：
const pet = await this.getPet(currentPetId);
pet.feed_interval  // ❌ undefined! 应该是 pet.data.feed_interval
```

微信云数据库的 `get()` 返回结构：
```javascript
{
  _id: "文档 ID",
  data: {
    // 实际字段数据
    name: "1",
    feed_interval: 3,
    sub_interval: 15
  }
}
```

### 修复方案

**文件**: `pages/index/index.js` - `getPet` 方法

```javascript
// ✅ 修复后
getPet(petId) {
  if (!wx.cloud) {
    return Promise.resolve({ feed_interval: 3, sub_interval: 15 });
  }

  const db = wx.cloud.database();
  return db.collection('pet_info').doc(petId).get()
    .then(res => {
      console.log('getPet 返回:', res.data);
      return res.data;  // ← 返回 data 字段，而不是整个响应对象
    });
}
```

### 增强验证

同时在 `confirmFeed` 方法中添加了更详细的日志和验证：

```javascript
const pet = await this.getPet(currentPetId);
console.log('获取到的宠物数据:', pet);

// 验证 feed_interval 是否有效
if (!pet.feed_interval || isNaN(parseInt(pet.feed_interval))) {
  wx.hideLoading();
  wx.showToast({ title: '宠物喂食频率设置无效', icon: 'none' });
  console.error('feed_interval 无效:', pet.feed_interval, '完整宠物数据:', pet);
  return;
}
```

---

## 🔧 其他改进

### 1. 类型兼容性修复

**文件**: `pages/index/index.js` - `onCheckIn` 方法

```javascript
// 使用 String() 转换，避免类型不匹配
const pet = this.data.todoList.find(t => {
  return String(t.petId) === String(petId) && t.taskType === taskType;
});
```

### 2. 错误提示优化

```javascript
if (!pet) {
  console.error('未找到匹配的宠物:', { petId, taskType, todoList: this.data.todoList });
  wx.showToast({ title: '未找到宠物信息', icon: 'none' });
  return;
}
```

### 3. 调试日志增强

在关键方法中添加了详细的 `console.log`：
- `calculateTodoList` - 显示输入输出和每个宠物的检查结果
- `onCheckIn` - 显示参数和查找结果
- `getPet` - 显示返回的宠物数据
- `confirmFeed` - 显示完整的打卡流程

---

## 🧪 测试验证

### 测试场景 1: 正常打卡
1. 首页有待办事项
2. 点击打卡 → 填写信息 → 确认
3. ✅ 打卡成功，下次日期正确计算

### 测试场景 2: 逾期补打卡
1. 修改宠物的 `next_feed_date` 为过去日期
2. 首页显示"已逾期 X 天"
3. 点击打卡 → 选择今天 → 确认
4. ✅ 下次日期 = 今天 + 频率，不再显示逾期

### 测试场景 3: 频率字段缺失
1. 云数据库中删除宠物的 `feed_interval` 字段
2. 点击打卡 → 确认
3. ✅ 提示"宠物喂食频率设置无效"，不会写入错误数据

### 测试场景 4: 无效日期数据
1. 云数据库中设置 `next_feed_date = "NaN-NaN-NaN"`
2. 首页刷新
3. ✅ 显示"未设置"而不是 "NaN-NaN-NaN 天"

---

## 📝 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `app.js` | `dateAdd` 函数参数验证 |
| `pages/index/index.js` | `getPet` 返回值修复 |
| `pages/index/index.js` | `confirmFeed` 验证增强 |
| `pages/index/index.js` | `onCheckIn` 类型兼容 |
| `pages/index/index.js` | `calculateTodoList` NaN 过滤 |
| `pages/index/index.js` | `calculateRelaxInfo` NaN 过滤 |
| `pages/index/index.wxml` | 显示防御处理 |
| `README.md` | 更新日志和 FAQ |

---

## 💡 经验总结

### 1. 云数据库返回值结构
微信云开发 `get()` 返回的是包装对象，实际数据在 `data` 字段中：
```javascript
const res = await db.collection('xxx').doc(id).get();
res.data  // ← 这才是实际数据
```

### 2. 日期计算必须验证参数
任何日期计算函数都应该：
- 验证日期字符串是否有效
- 验证数字参数是否为 NaN
- 提供默认值或错误处理

### 3. 显示层防御性编程
WXML 中的显示应该：
- 检查 NaN 字符串
- 提供默认显示文本
- 避免直接拼接可能为空的变量

### 4. 调试日志的重要性
详细的 `console.log` 可以快速定位：
- 数据流向问题
- 类型不匹配问题
- 条件判断失败原因

---

## 🔗 相关文档

- [README.md](../README.md) - 项目主文档
- [utils/util.js](../../utils/util.js) - 工具函数
- [pages/index/index.js](../../pages/index/index.js) - 首页逻辑

---

_文档创建时间：2026-04-06_
