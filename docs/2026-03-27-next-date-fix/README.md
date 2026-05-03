# 操作文档 - 下次日期计算逻辑优化

**日期：** 2026-03-27 20:30  
**操作人：** 开发者  
**功能：** 优化下次喂食/垫材日期的计算逻辑

---

## 📋 问题描述

### 原问题
用户在**编辑宠物档案**修改喂食/垫材频率时，系统会**立即重新计算**下次日期，导致：
- 用户只是调整频率，但下次日期被重置
- 与实际打卡逻辑不符（下次日期应由打卡日期决定）

### 期望行为
- **新建宠物**：从当天开始计算下次日期 ✅
- **打卡后**：从打卡日期开始计算下次日期 ✅
- **编辑宠物档案**：**不修改**下次日期，只更新频率设置 ✅

---

## 📝 修改内容

### 文件：`pages/add-pet/add-pet.js`

#### 修改位置：`onSubmit()` 方法

**修改前：**
```javascript
const today = app.formatDate(new Date());
const nextFeedDate = app.dateAdd(today, finalFeedInterval);
const nextSubDate = app.dateAdd(today, finalSubInterval);

const petData = {
  // ...
  feed_interval: finalFeedInterval,
  sub_interval: finalSubInterval,
  next_feed_date: nextFeedDate,  // 总是重新计算
  next_sub_date: nextSubDate,    // 总是重新计算
  // ...
};
```

**修改后：**
```javascript
const petData = {
  // ...
  feed_interval: finalFeedInterval,
  sub_interval: finalSubInterval,
  // 不设置 next_feed_date 和 next_sub_date
  // ...
};

// 只有新建宠物时才计算下次日期
if (!this.data.isEdit) {
  petData.next_feed_date = app.dateAdd(today, finalFeedInterval);
  petData.next_sub_date = app.dateAdd(today, finalSubInterval);
}
// 编辑模式：不修改下次日期，保持原有值
```

---

## 🎯 逻辑说明

### 下次日期计算时机

| 场景 | 是否计算下次日期 | 说明 |
|------|----------------|------|
| **新建宠物** | ✅ 是 | 从当天开始计算：`今天 + 频率` |
| **喂食打卡** | ✅ 是 | 从打卡日期计算：`打卡日 + 频率` |
| **换垫材打卡** | ✅ 是 | 从打卡日期计算：`打卡日 + 频率` |
| **编辑宠物档案** | ❌ 否 | 只更新频率，不修改下次日期 |

### 为什么这样设计？

1. **打卡逻辑**：下次日期由**实际打卡日期**决定，而非设定频率的日期
2. **频率调整**：用户可能只是优化设置，不应影响已有日程
3. **一致性**：与"动态顺延"逻辑保持一致（实际打卡日 + 频率）

---

## 📊 示例场景

### 场景 1：新建宠物
```
用户操作：添加新宠物，设置喂食频率 3 天
今天：2026-03-27
结果：next_feed_date = 2026-03-30
```

### 场景 2：打卡喂食
```
用户操作：今天喂食打卡
今天：2026-03-28（比原计划早 2 天）
频率：3 天
结果：next_feed_date = 2026-03-31（从实际打卡日计算）
```

### 场景 3：编辑宠物档案
```
用户操作：修改喂食频率从 3 天改为 4 天
原下次日期：2026-03-30
结果：next_feed_date 保持 2026-03-30 不变 ✅
```

---

## ✅ 测试清单

- [ ] 新建宠物，检查下次日期计算正确
- [ ] 编辑宠物频率，检查下次日期**不变**
- [ ] 喂食打卡后，检查下次日期更新正确
- [ ] 换垫材打卡后，检查下次日期更新正确
- [ ] 宠物详情页显示正确

---

## 📁 相关文件

- `pages/add-pet/add-pet.js` - 已修改
- `pages/index/index.js` - 打卡逻辑（无需修改）
- `pages/pet-detail/pet-detail.js` - 显示逻辑（无需修改）

---

*文档创建时间：2026-03-27 20:30*
