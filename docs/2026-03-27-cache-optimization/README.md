# 操作文档 - 数据库缓存优化方案

**日期：** 2026-03-27 20:54  
**操作人：** 开发者  
**功能：** 混合缓存方案（本地缓存 + 关键操作刷新）

---

## 📋 问题背景

### 原有问题
- 用户每次切换页面都查询数据库
- 即使数据没有变化，也消耗读取次数
- 免费额度 10 万次/月，可能不够用

### 优化目标
- **减少 70-80% 的数据库读取次数**
- 保持数据及时性（打卡后立即刷新）
- 用户无感知（缓存透明）

---

## 🎯 实现方案

### 方案 3：混合缓存（缓存 + 关键操作刷新）

**核心逻辑：**
```
读取数据 → 检查缓存 → 有效则用缓存 → 失效则查数据库
写操作 → 清除相关缓存 → 强制刷新
```

**缓存配置：**
```javascript
const CACHE_CONFIG = {
  pets: 10 * 60 * 1000,      // 宠物列表 10 分钟
  schedule: 5 * 60 * 1000,   // 日程数据 5 分钟
  weight: 30 * 60 * 1000,    // 体重记录 30 分钟
  history: 15 * 60 * 1000    // 历史记录 15 分钟
};
```

---

## 📝 修改内容

### 1. 创建缓存管理工具

**文件：** `utils/cache.js`

**功能：**
- `getCache(type)` - 获取缓存（自动检查有效期）
- `setCache(type, data)` - 设置缓存
- `removeCache(type)` - 清除指定缓存
- `clearAllCache()` - 清除所有缓存
- `getCacheStats()` - 获取缓存统计

---

### 2. 修改 app.js

**文件：** `app.js`

**修改：**
```javascript
const cache = require('./utils/cache.js');

App({
  onLaunch() {
    // ... 云开发初始化
    
    // 输出缓存统计
    const stats = cache.getCacheStats();
    if (Object.keys(stats).length > 0) {
      console.log('缓存状态:', stats);
    }
  }
});
```

---

### 3. 修改首页

**文件：** `pages/index/index.js`

**修改：**
```javascript
const cache = require('../../utils/cache.js');

// 获取宠物数据（带缓存）
async getPetsWithCache() {
  const cached = cache.getCache('pets');
  if (cached) return cached;
  
  const pets = await this.fetchPets();
  cache.setCache('pets', pets);
  return pets;
}

// 打卡后清除缓存
async confirmFeed() {
  // ... 打卡逻辑
  
  // 清除相关缓存
  cache.removeCache('pets');
  cache.removeCache('schedule');
  cache.removeCache('history');
}
```

---

### 4. 修改宠物列表页

**文件：** `pages/pets/pets.js`

**修改：**
```javascript
// 获取宠物及状态（带缓存）
async getPetsWithStatus() {
  const cached = cache.getCache('pets');
  if (cached) {
    console.log('宠物列表：使用缓存数据');
    return cached;
  }
  
  const pets = await this.fetchPetsWithStatus();
  cache.setCache('pets', pets);
  return pets;
}

// 强制刷新缓存
async refreshPetsCache() {
  const pets = await this.fetchPetsWithStatus();
  cache.setCache('pets', pets);
  this.setData({ pets });
}
```

---

### 5. 修改宠物详情页

**文件：** `pages/pet-detail/pet-detail.js`

**修改：**
```javascript
// 获取宠物信息（带缓存）
async getPetInfoWithCache() {
  const cached = cache.getCache('pets');
  if (cached && cached.length > 0) {
    const pet = cached.find(p => p._id === this.data.petId);
    if (pet) return pet;
  }
  
  return await this.fetchPetInfo();
}

// 获取体重记录（带缓存，按宠物 ID 存储）
async getWeightRecordsWithCache() {
  const cached = cache.getCache('weight');
  if (cached && cached[this.data.petId]) {
    return cached[this.data.petId];
  }
  
  const records = await this.fetchWeightRecords();
  const weightCache = cached || {};
  weightCache[this.data.petId] = records;
  cache.setCache('weight', weightCache);
  return records;
}

// 清除当前宠物缓存
clearPetCache() {
  cache.removeCache('pets');
  cache.removeCache('weight');
  cache.removeCache('history');
  cache.removeCache('schedule');
}
```

---

### 6. 修改体重记录页

**文件：** `pages/weight-record/weight-record.js`

**修改：**
```javascript
// 提交后清除缓存
async onSubmit() {
  // ... 保存逻辑
  
  // 清除相关缓存
  cache.removeCache('pets');
  cache.removeCache('weight');
  cache.removeCache('history');
  cache.removeCache('schedule');
}

// 删除后清除缓存
async onDelete() {
  // ... 删除逻辑
  
  // 清除相关缓存
  cache.removeCache('pets');
  cache.removeCache('weight');
  cache.removeCache('history');
  cache.removeCache('schedule');
}
```

---

## 📊 缓存策略详解

### 缓存类型及有效期

| 类型 | 键名 | 有效期 | 说明 |
|------|------|--------|------|
| 宠物列表 | `cache_pets` | 10 分钟 | 宠物基本信息，变更少 |
| 日程数据 | `cache_schedule` | 5 分钟 | 需要及时性，较短 |
| 体重记录 | `cache_weight` | 30 分钟 | 几乎不变，较长 |
| 历史记录 | `cache_history` | 15 分钟 | 中等长度 |

### 缓存数据结构

**宠物列表（数组）：**
```javascript
[
  {
    _id: 'xxx',
    name: '蜜瓜',
    species: '豹纹守宫',
    next_feed_date: '2026-03-30',
    next_sub_date: '2026-04-12',
    feedStatus: 'upcoming',
    feedStatusText: '3 天后',
    // ...
  }
]
```

**体重记录（对象，按宠物 ID 存储）：**
```javascript
{
  'dde8ef4869c57ae801bf270f5d97e177': [
    { weight: 30, record_date: '2026-03-27' },
    { weight: 25, record_date: '2026-03-20' }
  ],
  'another_pet_id': [...]
}
```

**历史记录（对象，按宠物 ID 存储）：**
```javascript
{
  'dde8ef4869c57ae801bf270f5d97e177': [
    { type: 'feed', date: '2026-03-27', detail: '杜比亚 3 只' },
    { type: 'weight', date: '2026-03-27', weight: 30 }
  ]
}
```

---

## 🎯 缓存失效时机

### 自动失效（时间到期）
```
缓存时间 + 有效期 < 当前时间 → 自动失效
```

### 手动失效（写操作后）

| 操作 | 清除的缓存 |
|------|-----------|
| 喂食打卡 | `pets`, `schedule`, `history` |
| 换垫材打卡 | `pets`, `schedule`, `history` |
| 记录体重 | `pets`, `weight`, `history`, `schedule` |
| 删除记录 | `pets`, `weight`, `history`, `schedule` |
| 编辑宠物 | `pets` |

---

## 📈 预期效果

### 使用场景对比

**无缓存：**
```
打开首页 → 查询 3 次（pet_info, feed_logs, substrate_logs）
切换到宠物列表 → 查询 2 次（pet_info, weight_logs）
打开宠物详情 → 查询 4 次（pet_info, weight_logs, feed_logs, substrate_logs）
返回首页 → 又查询 3 次
...
总计：约 12 次查询/轮
```

**有缓存（5 分钟内）：**
```
打开首页 → 查询 3 次（首次）
切换到宠物列表 → 0 次（用缓存）
打开宠物详情 → 0 次（用缓存）
返回首页 → 0 次（用缓存）
...
总计：3 次查询（首次）+ 0 次（后续）
```

**节省：** 约 **75%** 的读取次数

### 月度用量预估

| 场景 | 无缓存 | 有缓存 | 节省 |
|------|--------|--------|------|
| 每天使用 10 次 | 120 次/天 | 30 次/天 | 75% |
| 每月用量 | 3600 次 | 900 次 | 75% |
| 免费额度 | 100,000 次 | 100,000 次 | - |
| 可用月数 | 27 个月 | 111 个月 | **4 倍** |

---

## ✅ 测试清单

### 缓存功能
- [ ] 首次加载从数据库读取
- [ ] 5 分钟内切换页面用缓存
- [ ] 5 分钟后自动失效重新读取
- [ ] 打卡后缓存清除，下次读取最新数据

### 数据一致性
- [ ] 打卡后立即看到更新
- [ ] 删除记录后立即看到更新
- [ ] 多页面数据同步

### 性能
- [ ] 缓存读取速度 < 50ms
- [ ] 数据库读取速度 < 500ms
- [ ] 页面切换流畅无卡顿

---

## 🔧 调试技巧

### 查看缓存状态
```javascript
// 在控制台输出
const stats = cache.getCacheStats();
console.log('缓存状态:', stats);
```

### 手动清除缓存
```javascript
// 清除所有缓存
cache.clearAllCache();

// 清除指定缓存
cache.removeCache('pets');
```

### 强制刷新
```javascript
// 宠物列表页
await this.refreshPetsCache();

// 宠物详情页
this.clearPetCache();
await this.loadPetDetail();
```

---

## 📁 相关文件

| 文件 | 说明 |
|------|------|
| `utils/cache.js` | 缓存管理工具（新增） |
| `app.js` | 引入缓存工具 |
| `pages/index/index.js` | 首页缓存逻辑 |
| `pages/pets/pets.js` | 宠物列表页缓存逻辑 |
| `pages/pet-detail/pet-detail.js` | 宠物详情页缓存逻辑 |
| `pages/weight-record/weight-record.js` | 记录页清除缓存逻辑 |

---

*文档创建时间：2026-03-27 20:54*
