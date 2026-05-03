# 操作文档 - 初始体重显示和打卡后显示日程

**日期：** 2026-03-27 20:44  
**操作人：** 开发者  
**功能：** 初始体重显示优化 + 打卡后才显示下次日程

---

## 📋 修改内容

### 1. 当前体重显示逻辑

**文件：** `pages/pet-detail/pet-detail.js`

**修改前：**
```javascript
const latestWeight = weightRecords.length > 0 ? weightRecords[0].weight : 0;
const currentWeight = latestWeight;  // 没有记录时显示 0
```

**修改后：**
```javascript
const latestWeight = weightRecords.length > 0 ? weightRecords[0].weight : null;
// 如果没有体重记录，当前体重 = 初始体重
const currentWeight = latestWeight !== null ? latestWeight : (petInfo.initialWeight || 0);
```

**效果：**
- 没有体重记录时，"当前"显示初始体重的值
- 有体重记录后，"当前"显示最新记录的体重

---

### 2. 新建宠物不设置下次日期

**文件：** `pages/add-pet/add-pet.js`

**修改前：**
```javascript
// 新建宠物时计算下次日期
if (!this.data.isEdit) {
  petData.next_feed_date = app.dateAdd(today, finalFeedInterval);
  petData.next_sub_date = app.dateAdd(today, finalSubInterval);
}
```

**修改后：**
```javascript
const petData = {
  // ... 其他字段
  // 不设置 next_feed_date 和 next_sub_date
  // 这两个字段只有在第一次打卡后才会设置
};
```

**效果：**
- 新建宠物时不设置下次日程
- 只有第一次打卡后才设置对应的下次日期

---

## 🎯 用户流程

### 流程 1：新建宠物
```
1. 用户添加宠物"蜜瓜"
2. 设置初始体重 20g
3. 设置喂食频率 3 天，垫材频率 15 天
4. 保存

结果：
- 宠物详情页"当前体重" = 20g（初始体重）✅
- 宠物详情页不显示"下次提醒"区域 ✅
- 宠物列表页显示"未设置" ✅
```

### 流程 2：记录第一次体重
```
1. 用户点击"记录体重"
2. 输入 20g（或实际体重）
3. 保存

结果：
- 宠物详情页"当前体重" = 20g（记录值）✅
- 图表开始显示 ✅
- 增长 = 0g ✅
```

### 流程 3：第一次喂食打卡
```
1. 用户点击"喂食打卡"
2. 选择食物，确认打卡
3. 系统设置 next_feed_date = 打卡日 + 3 天

结果：
- 宠物详情页显示"下次提醒 - 喂食" ✅
- 宠物列表页显示喂食状态 ✅
- 首页显示喂食待办（如果到期）✅
```

### 流程 4：第一次换垫材打卡
```
1. 用户点击"换垫材"
2. 确认打卡
3. 系统设置 next_sub_date = 打卡日 + 15 天

结果：
- 宠物详情页"下次提醒"新增垫材条目 ✅
- 宠物列表页显示垫材状态 ✅
```

---

## 📊 数据状态对比

| 时机 | next_feed_date | next_sub_date | 当前体重 | 下次提醒显示 |
|------|---------------|---------------|---------|-------------|
| 新建宠物后 | null | null | 初始体重 | ❌ 不显示 |
| 记录体重后 | null | null | 记录体重 | ❌ 不显示 |
| 喂食打卡后 | 2026-XX-XX | null | 记录体重 | 🍖 喂食 |
| 换垫材后 | 2026-XX-XX | 2026-XX-XX | 记录体重 | 🍖 喂食 + 🧹 垫材 |

---

## ✅ 测试清单

### 体重显示
- [ ] 新建宠物无体重记录，"当前"显示初始体重
- [ ] 记录一次体重后，"当前"显示记录值
- [ ] 多次记录后，"当前"显示最新记录
- [ ] 增长值计算正确（当前 - 初始）

### 日程显示
- [ ] 新建宠物后，详情页不显示"下次提醒"
- [ ] 新建宠物后，列表页显示"未设置"
- [ ] 喂食打卡后，详情页显示喂食提醒
- [ ] 换垫材打卡后，详情页新增垫材提醒
- [ ] 打卡后列表页状态更新正确

---

## 📁 相关文件

| 文件 | 修改内容 |
|------|---------|
| `pages/pet-detail/pet-detail.js` | 当前体重逻辑 + 计划标志判断 |
| `pages/add-pet/add-pet.js` | 不设置下次日期 |
| `pages/pet-detail/pet-detail.wxml` | 条件显示提醒区域 |
| `pages/pets/pets.js` | 状态计算检查计划 |
| `pages/index/index.js` | 待办和清闲逻辑 |

---

*文档创建时间：2026-03-27 20:44*
