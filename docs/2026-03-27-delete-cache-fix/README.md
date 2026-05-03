# 操作文档 - 删除后缓存刷新修复

**日期：** 2026-03-27 21:12  
**操作人：** 开发者  
**问题：** 删除记录后缓存未正确更新，导致数据显示不正确

---

## 📋 问题描述

### 原有问题
1. **删除喂食记录后** → 首页仍显示该记录
2. **删除宠物后** → 爱宠页面仍显示"已逾期"
3. **删除记录后** → 下次日期没有重新计算

### 根本原因
- 删除后只清除了缓存，没有强制刷新
- 删除记录后没有重新计算下次日期
- 页面返回时没有触发刷新

---

## 📝 修复内容

### 1. 删除记录时重新计算下次日期

**文件：** `pages/weight-record/weight-record.js`

**新增方法：**
```javascript
// 重新计算下次喂食日期（删除记录后）
async recalculateNextFeedDate(petId) {
  const logs = await db.collection('feed_logs')
    .where({ pet_id: petId })
    .orderBy('feed_date', 'desc')
    .limit(1)
    .get();
  
  const pet = await db.collection('pet_info').doc(petId).get();
  
  if (logs.data.length > 0) {
    // 有记录：从最后一次喂食日期重新计算
    const lastFeedDate = logs.data[0].feed_date;
    const nextDate = app.dateAdd(lastFeedDate, pet.data.feed_interval);
    await db.collection('pet_info').doc(petId).update({
      data: { next_feed_date: nextDate }
    });
  } else {
    // 没有记录：清空下次喂食日期
    await db.collection('pet_info').doc(petId).update({
      data: { next_feed_date: null }
    });
  }
}
```

---

### 2. 删除后强制刷新前一页

**文件：** `pages/weight-record/weight-record.js`

**修改：**
```javascript
// 删除成功后
wx.showToast({ title: '删除成功', icon: 'success' });

// 返回并传递刷新标志
setTimeout(() => {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    const prevPage = pages[pages.length - 2];
    if (prevPage.onShow) {
      prevPage.onShow(); // 强制刷新前一页
    }
  }
  wx.navigateBack();
}, 1500);
```

---

### 3. 宠物列表页 onShow 强制刷新

**文件：** `pages/pets/pets.js`

**修改前：**
```javascript
onShow() {
  this.loadPets();  // 可能使用缓存
}
```

**修改后：**
```javascript
onShow() {
  // 强制刷新，不使用缓存
  this.refreshPetsCache();
}
```

---

### 4. 首页 onShow 强制刷新

**文件：** `pages/index/index.js`

**修改前：**
```javascript
onShow() {
  this.loadTodayData();  // 可能使用缓存
}
```

**修改后：**
```javascript
onShow() {
  // 强制刷新，不使用缓存
  this.refreshTodayData();
}
```

**新增方法：**
```javascript
// 强制刷新今日数据（不使用缓存）
async refreshTodayData() {
  // 1. 强制刷新宠物数据
  const pets = await this.refreshPetsCache();
  
  // 2. 强制刷新最近记录
  const recentRecords = await this.fetchRecentRecords();
  cache.setCache('history', recentRecords);
  
  // ... 更新数据
}
```

---

### 5. 宠物详情页删除后重新计算

**文件：** `pages/pet-detail/pet-detail.js`

**新增方法：**
```javascript
// 重新计算下次日期（删除记录后）
async recalculateNextDate(petId, type) {
  const logs = await db.collection(
    type === 'feed' ? 'feed_logs' : 'substrate_logs'
  )
  .where({ pet_id: petId })
  .orderBy(type === 'feed' ? 'feed_date' : 'change_date', 'desc')
  .limit(1)
  .get();
  
  const pet = await db.collection('pet_info').doc(petId).get();
  
  const fieldName = type === 'feed' ? 'next_feed_date' : 'next_sub_date';
  const dateField = type === 'feed' ? 'feed_date' : 'change_date';
  const intervalField = type === 'feed' ? 'feed_interval' : 'sub_interval';
  
  if (logs.data.length > 0) {
    const lastDate = logs.data[0][dateField];
    const nextDate = app.dateAdd(lastDate, pet.data[intervalField]);
    await db.collection('pet_info').doc(petId).update({
      data: { [fieldName]: nextDate }
    });
  } else {
    // 没有记录：清空下次日期
    await db.collection('pet_info').doc(petId).update({
      data: { [fieldName]: null }
    });
  }
}
```

---

## 🎯 删除流程

### 完整的删除流程

```
1. 用户点击删除
   ↓
2. 从数据库删除记录
   ↓
3. 查询剩余的记录（按日期降序取第一条）
   ↓
4. 如果有记录 → 从最后一条记录重新计算下次日期
   如果没有记录 → 清空下次日期（设为 null）
   ↓
5. 更新 pet_info 表的 next_feed_date / next_sub_date
   ↓
6. 清除所有相关缓存
   ↓
7. 强制刷新前一页（调用 onShow）
   ↓
8. 返回上一页，显示最新数据
```

---

## 📊 删除场景示例

### 场景 1：删除最后一次喂食记录

**删除前：**
```
喂食记录：
  2026-03-27（最新）
  2026-03-24
  2026-03-21

next_feed_date: 2026-03-30（从 03-27 + 3 天计算）
```

**删除 03-27 的记录后：**
```
喂食记录：
  2026-03-24（最新）
  2026-03-21

next_feed_date: 2026-03-27（从 03-24 + 3 天重新计算）✅
```

---

### 场景 2：删除所有喂食记录

**删除前：**
```
喂食记录：
  2026-03-27

next_feed_date: 2026-03-30
```

**删除后：**
```
喂食记录：
  （空）

next_feed_date: null（清空）✅
宠物列表显示：未设置
```

---

### 场景 3：删除垫材记录

**流程相同：**
```
删除垫材记录 → 查询剩余记录 → 重新计算 next_sub_date
```

---

## ✅ 测试清单

### 删除喂食记录
- [ ] 删除最后一次喂食记录 → 下次日期从倒数第二条重新计算
- [ ] 删除所有喂食记录 → 下次日期清空，显示"未设置"
- [ ] 删除后返回首页 → 待办列表立即更新
- [ ] 删除后返回宠物列表 → 状态立即更新

### 删除垫材记录
- [ ] 删除最后一次垫材记录 → 下次日期从倒数第二条重新计算
- [ ] 删除所有垫材记录 → 下次日期清空，显示"未设置"

### 删除体重记录
- [ ] 删除体重记录 → 图表立即更新
- [ ] 删除初始体重记录 → "初始体重"从 pet_info 读取

### 删除宠物
- [ ] 删除宠物 → 宠物列表立即不显示
- [ ] 删除宠物 → 首页宠物数量立即更新

---

## 🔧 调试技巧

### 查看缓存状态
```javascript
const cache = require('./utils/cache.js');
console.log(cache.getCacheStats());
```

### 手动清除缓存
```javascript
cache.clearAllCache();
```

### 强制刷新
```javascript
// 首页
this.refreshTodayData();

// 宠物列表
this.refreshPetsCache();

// 宠物详情
this.loadPetDetail();
```

---

## 📁 相关文件

| 文件 | 修改内容 |
|------|---------|
| `pages/weight-record/weight-record.js` | 删除后重新计算日期 + 强制刷新 |
| `pages/pet-detail/pet-detail.js` | 删除后重新计算日期 |
| `pages/pets/pets.js` | onShow 强制刷新 |
| `pages/index/index.js` | onShow 强制刷新 + refreshTodayData |

---

*文档创建时间：2026-03-27 21:12*
