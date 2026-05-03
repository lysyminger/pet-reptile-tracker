# 操作文档 - 日程显示逻辑优化

**日期：** 2026-03-27 20:39  
**操作人：** 开发者  
**功能：** 只有用户打卡后才显示下次日程提醒

---

## 📋 问题描述

### 原有逻辑
- 新建宠物时立即计算并显示下次喂食/垫材日期
- 用户还没开始打卡，就显示"还有 X 天"

### 期望逻辑
- **新建宠物**：不显示下次日程（`next_feed_date` 和 `next_sub_date` 为空）
- **第一次喂食打卡后**：开始显示下次喂食日期
- **第一次换垫材打卡后**：开始显示下次换垫材日期
- "下次提醒"区域动态显示（打卡什么显示什么）

---

## 📝 修改内容

### 1. `pages/add-pet/add-pet.js`

**修改：** 新建宠物时才计算下次日期，编辑时不修改

```javascript
// 只有新建宠物时才计算下次日期
if (!this.data.isEdit) {
  petData.next_feed_date = app.dateAdd(today, finalFeedInterval);
  petData.next_sub_date = app.dateAdd(today, finalSubInterval);
}
// 编辑模式：不修改下次日期，保持原有值
```

### 2. `pages/pets/pets.js`

**修改：** 状态计算前检查是否有计划

```javascript
// 喂食状态
if (pet.next_feed_date) {
  hasFeedSchedule = true;
  // 计算状态...
} else {
  feedStatus = 'none';
  feedStatusText = '未设置';
}

// 垫材状态（同理）
```

### 3. `pages/pets/pets.wxml`

**修改：** 样式调整，未设置时显示灰色

```xml
<text class="stat-value {{item.feedStatus === 'overdue' ? 'text-danger' : (item.feedStatus === 'today' ? 'text-warning' : (item.feedStatus === 'upcoming' ? 'text-success' : 'text-hint'))}}">
  {{item.feedStatusText}}
</text>
```

### 4. `pages/pet-detail/pet-detail.wxml`

**修改：** 条件显示"下次提醒"区域和条目

```xml
<!-- 只有至少有一个计划才显示提醒区域 -->
<view class="next-reminder card" wx:if="{{hasFeedSchedule || hasSubSchedule}}">
  <!-- 喂食条目：只有设置了才显示 -->
  <view class="reminder-item" wx:if="{{hasFeedSchedule}}">
    ...
  </view>
  <!-- 垫材条目：只有设置了才显示 -->
  <view class="reminder-item" wx:if="{{hasSubSchedule}}">
    ...
  </view>
</view>
```

### 5. `pages/pet-detail/pet-detail.js`

**修改：** 添加计划标志判断

```javascript
const hasFeedSchedule = !!petInfo.next_feed_date;
const hasSubSchedule = !!petInfo.next_sub_date;

this.setData({
  hasFeedSchedule,
  hasSubSchedule,
  isFeedOverdue: hasFeedSchedule && petInfo.next_feed_date < today,
  isSubOverdue: hasSubSchedule && petInfo.next_sub_date < today,
  ...
});
```

### 6. `pages/index/index.js`

**修改：** 待办列表和清闲信息只考虑有计划的宠物

```javascript
// calculateTodoList
if (pet.next_feed_date && pet.next_feed_date <= today) {
  // 添加待办
}

// calculateRelaxInfo
if (pet.next_feed_date) {
  // 计算天数
}
```

---

## 🎯 用户流程

### 流程 1：新建宠物
```
1. 用户添加新宠物"蜜瓜"
2. 设置喂食频率 3 天，垫材频率 15 天
3. 保存 → next_feed_date 和 next_sub_date 为空
4. 宠物列表页显示：喂食"未设置"，垫材"未设置"
5. 宠物详情页：不显示"下次提醒"区域
```

### 流程 2：第一次喂食打卡
```
1. 用户点击"喂食打卡"
2. 选择食物，确认打卡
3. 系统计算：next_feed_date = 打卡日 + 3 天
4. 宠物列表页显示：喂食"3 天后"
5. 宠物详情页显示："下次提醒 - 喂食 2026-03-30"
```

### 流程 3：第一次换垫材打卡
```
1. 用户点击"换垫材"
2. 确认打卡
3. 系统计算：next_sub_date = 打卡日 + 15 天
4. 宠物列表页显示：垫材"15 天后"
5. 宠物详情页显示："下次提醒"区域新增垫材条目
```

---

## 📊 状态对比

| 场景 | 宠物列表页 | 宠物详情页 | 首页待办 |
|------|-----------|-----------|---------|
| 新建宠物后 | 未设置 / 未设置 | 无提醒区域 | 无待办 |
| 喂食打卡后 | X 天后 / 未设置 | 显示喂食提醒 | 显示喂食待办 |
| 垫材打卡后 | X 天后 / X 天后 | 显示喂食 + 垫材提醒 | 显示喂食 + 垫材待办 |

---

## ✅ 测试清单

- [ ] 新建宠物，检查列表页显示"未设置"
- [ ] 新建宠物，检查详情页不显示"下次提醒"
- [ ] 喂食打卡后，检查列表页显示喂食状态
- [ ] 喂食打卡后，检查详情页显示喂食提醒
- [ ] 换垫材打卡后，检查列表页显示垫材状态
- [ ] 换垫材打卡后，检查详情页新增垫材提醒
- [ ] 首页待办只在打卡后显示
- [ ] 清闲信息只在有计划的宠物上计算

---

## 📁 相关文件

| 文件 | 修改内容 |
|------|---------|
| `pages/add-pet/add-pet.js` | 新建时计算下次日期 |
| `pages/pets/pets.js` | 状态计算检查计划 |
| `pages/pets/pets.wxml` | 样式调整 |
| `pages/pet-detail/pet-detail.wxml` | 条件显示提醒 |
| `pages/pet-detail/pet-detail.js` | 添加计划标志 |
| `pages/index/index.js` | 待办和清闲逻辑 |

---

*文档创建时间：2026-03-27 20:39*
