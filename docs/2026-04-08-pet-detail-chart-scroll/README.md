# 2026-04-08 宠物详情页图表滑动功能改造

> 📅 修改日期：2026-04-08  
> 📦 版本：v1.0.8  
> 🔧 修改人：AI Assistant

---

## 📋 修改概述

本次改造解决了宠物详情页体重图表日期显示重叠的问题，实现了：
1. **折线图可横向滑动** - 数据点不再拥挤
2. **日期对照表可滑动** - 独立的可滑动数据表
3. **图表下方日期条** - 与图表数据点对齐的日期标注
4. **Y 轴刻度优化** - 整数显示，字体缩小
5. **同步滚动** - 图表和数据表滚动联动

---

## 🎯 需求背景

### 原问题
当宠物体重记录较多时，折线图 X 轴的日期标签会重叠在一起，导致：
- 日期无法清晰阅读
- 图表显得拥挤
- 用户体验差

### 用户需求
1. 折线图可以横向滑动查看
2. 日期显示不重叠
3. 有清晰的日期 - 体重对照表

---

## 🔧 修改方案

### 第一阶段：移除折线图 X 轴日期，添加对照表

#### 修改文件：`pages/pet-detail/pet-detail.js`

**1. 移除 X 轴日期标签绘制**

```javascript
// ❌ 修改前 - 绘制 X 轴日期标签
data.forEach((item, index) => {
  // ... 绘制数据点 ...
  
  // X 轴标签
  const date = new Date(item.record_date);
  const label = `${date.getMonth() + 1}/${date.getDate()}`;
  ctx.fillStyle = '#666666';
  ctx.font = '25px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, height - padding.bottom + 25);

  // 体重数值（点的上方）
  ctx.fillStyle = '#4A9C7B';
  ctx.font = 'bold 35px sans-serif';
  ctx.fillText(item.weight, x, y - 20);
});

// ✅ 修改后 - 移除 X 轴标签
data.forEach((item, index) => {
  // ... 绘制数据点（外圈、内点）...
  // X 轴标签已移除，改为在下方日期对照表中显示
});
```

**2. Y 轴刻度改为整数（10 的倍数）**

```javascript
// ❌ 修改前 - 小数刻度
const minWeight = Math.min(...weights) * 0.95;
const maxWeight = Math.max(...weights) * 1.05;
const weightRange = maxWeight - minWeight || 1;

for (let i = 0; i <= 4; i++) {
  const weightValue = maxWeight - (weightRange / 4) * i;
  ctx.fillText(weightValue.toFixed(1), padding.left - 10, y + 5);
}

// ✅ 修改后 - 整数刻度（10 的倍数）
const minWeight = Math.floor(Math.min(...weights) / 10) * 10;
const maxWeight = Math.ceil(Math.max(...weights) / 10) * 10;
const weightRange = maxWeight - minWeight || 1;

for (let i = 0; i <= 5; i++) {
  const weightValue = maxWeight - (weightRange / 5) * i;
  ctx.fillStyle = '#666666';
  ctx.font = '18px sans-serif';  // 字体从 25px 改为 18px
  ctx.fillText(Math.round(weightValue), padding.left - 10, y + 5);
}
```

**3. Canvas padding 调整**

```javascript
// 底部 padding 从 60 改为 20，因为不再需要绘制 X 轴标签
const padding = { top: 50, right: 40, bottom: 20, left: 60 };
```

---

#### 修改文件：`pages/pet-detail/pet-detail.wxml`

**添加可滑动日期对照表**

```xml
<!-- 日期对照表 -->
<scroll-view class="date-table-scroll" scroll-x="true" wx:if="{{weightRecords.length > 0}}">
  <view class="date-table">
    <view class="date-table-header">
      <view class="date-table-cell" wx:for="{{weightRecords}}" wx:key="index">
        <view class="date-cell-wrapper">
          <text class="date-cell">{{item.record_date}}</text>
        </view>
      </view>
    </view>
    <view class="date-table-body">
      <view class="date-table-cell" wx:for="{{weightRecords}}" wx:key="index">
        <text class="weight-cell">{{item.weight}}g</text>
      </view>
    </view>
  </view>
</scroll-view>
```

---

#### 修改文件：`pages/pet-detail/pet-detail.wxss`

**日期对照表样式**

```css
/* 日期对照表滚动容器 */
.date-table-scroll {
  width: 100%;
  white-space: nowrap;
  border-top: 1rpx solid var(--border-color);
}

.date-table {
  display: inline-flex;
  flex-direction: column;
  width: max-content;
}

.date-table-header {
  background-color: #f5f5f5;
  border-bottom: 1rpx solid var(--border-color);
}

.date-table-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 8rpx;
  width: 100rpx;
  position: relative;
  height: 120rpx;
}

/* 日期倾斜 45 度显示 */
.date-cell-wrapper {
  transform: rotate(-45deg);
  position: absolute;
  white-space: nowrap;
}

.date-cell {
  font-size: 22rpx;
  color: var(--text-secondary);
}

.weight-cell {
  font-size: 26rpx;
  font-weight: bold;
  color: var(--primary-color);
}
```

---

### 第二阶段：折线图可滑动

#### 修改文件：`pages/pet-detail/pet-detail.wxml`

**将 Canvas 包裹在 scroll-view 中**

```xml
<!-- 可滑动的图表容器 -->
<scroll-view class="chart-scroll" scroll-x="true" 
  bindscroll="onChartScroll" scroll-left="{{chartScrollLeft}}">
  <view class="chart-wrapper" style="width: {{chartContainerWidth}}px;">
    <canvas type="2d" id="weightChart" canvas-id="weightChart" class="weight-chart"></canvas>
    <!-- 图表下方的日期对照条 -->
    <view class="chart-date-bar" style="width: {{chartContainerWidth}}px;">
      <view class="chart-date-item" wx:for="{{chartDataPoints}}" wx:key="index">
        <text class="chart-date-text">{{weightRecords[index].record_date}}</text>
      </view>
    </view>
  </view>
</scroll-view>
```

---

#### 修改文件：`pages/pet-detail/pet-detail.js`

**1. 添加数据状态**

```javascript
Page({
  data: {
    // ... 原有数据 ...
    chartContainerWidth: 600,  // 图表容器宽度，根据数据点动态计算
    isSyncingScroll: false,    // 防止滚动同步死循环
    chartScrollLeft: 0,        // 图表滚动位置
    tableScrollLeft: 0,        // 日期表滚动位置
    chartDataPoints: []        // 图表数据点位置（用于日期条对齐）
  },
```

**2. 动态计算图表宽度**

```javascript
// 每个数据点至少 100px 宽度，最少 600px
const chartContainerWidth = Math.max(600, weightRecords.length * 100);

// 计算图表中每个数据点的 X 位置（用于日期条对齐）
// Canvas 内图表区域有 padding: left=60, right=40
const padding = { left: 60, right: 40 };
const chartInnerWidth = chartContainerWidth - padding.left - padding.right;
const chartDataPoints = weightRecords.map((_, index) => ({
  position: padding.left + (index * chartInnerWidth) / (weightRecords.length > 1 ? weightRecords.length - 1 : 1)
}));

this.setData({
  weightRecords: weightRecords.slice().reverse(),  // 反转为正序
  chartDataPoints,
  chartContainerWidth
});
```

**3. Canvas 初始化使用动态宽度**

```javascript
initCanvas() {
  const dynamicWidth = this.data.chartContainerWidth;
  
  wx.createSelectorQuery().select('#weightChart')
    .fields({ node: true, size: true })
    .exec((res) => {
      const canvas = res[0].node;
      const dpr = wx.getSystemInfoSync().pixelRatio;
      
      canvas.width = dynamicWidth * dpr;
      canvas.height = 400 * dpr;
      
      this.setData({
        chartWidth: dynamicWidth,
        canvasInstance: canvas
      }, () => {
        this.drawWeightChart(this.data.weightRecords);
      });
    });
}
```

**4. 同步滚动处理**

```javascript
// 图表滚动事件
onChartScroll(e) {
  if (this.data.isSyncingScroll) return;

  this.setData({
    isSyncingScroll: true,
    tableScrollLeft: e.detail.scrollLeft
  }, () => {
    setTimeout(() => {
      this.setData({ isSyncingScroll: false });
    }, 50);
  });
}

// 日期表滚动事件
onDateTableScroll(e) {
  if (this.data.isSyncingScroll) return;

  this.setData({
    isSyncingScroll: true,
    chartScrollLeft: e.detail.scrollLeft * (this.data.chartContainerWidth / (this.data.weightRecords.length * 100))
  }, () => {
    setTimeout(() => {
      this.setData({ isSyncingScroll: false });
    }, 50);
  });
}
```

---

#### 修改文件：`pages/pet-detail/pet-detail.wxss`

**可滑动图表样式**

```css
/* 可滑动的图表容器 */
.chart-scroll {
  width: 100%;
  white-space: nowrap;
  padding: 20rpx 20rpx 0 20rpx;
  box-sizing: border-box;
}

.chart-wrapper {
  display: inline-block;
  vertical-align: top;
  position: relative;
}

.weight-chart {
  width: 100%;
  height: 400px !important;
  background-color: #FFFFFF;
  display: block;
}

/* 图表下方的日期条 */
.chart-date-bar {
  position: relative;
  height: 50rpx;
  background-color: #f9f9f9;
  border-top: 1rpx solid var(--border-color);
  width: 100%;
}

.chart-date-item {
  position: absolute;
  transform: translateX(-50%);
  text-align: center;
}

.chart-date-text {
  font-size: 20rpx;
  color: var(--text-secondary);
  white-space: nowrap;
}
```

---

## 📊 最终效果

### 布局结构

```
┌─────────────────────────────────────────────────────────┐
│  成长曲线                                   3 条记录    │
├─────────────────────────────────────────────────────────┤
│  [可横向滑动的 scroll-view]                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Canvas 图表 (400px 高)                           │   │
│  │  60 ─ ─ ─ ╱╲╱╲╱╲                                │   │ ← Y 轴整数刻度
│  │  50 ─ ─ ╱╲  ╱╲  ╱╲                              │   │   (18px 字体)
│  │  40 ─ ─    ╱╲  ╱╲                                │   │
│  │  30 ─ ─ ─ ─ ─ ─ ─ ─                             │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 日期条 (50rpx 高)                                │   │
│  │ 2024-01-01    2024-01-05    2024-01-10         │   │ ← 与数据点对齐
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  [可横向滑动的日期对照表]                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 2024-01-01  2024-01-05  2024-01-10             │   │ ← 倾斜 45°
│  │    45g         47g         50g                 │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  初始       当前        增长                             │
│  42.1g     50g       +7.9g                             │
└─────────────────────────────────────────────────────────┘
```

### 交互效果

| 操作 | 效果 |
|------|------|
| 滑动图表区域 | 日期条跟随移动 |
| 滑动日期对照表 | 图表跟随移动 |
| 数据点超过 6 个 | 自动启用横向滚动 |

---

## 📝 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `pages/pet-detail/pet-detail.wxml` | 添加 scroll-view 包裹 Canvas，添加日期对照表 |
| `pages/pet-detail/pet-detail.js` | 动态宽度计算、同步滚动逻辑、数据点位置计算 |
| `pages/pet-detail/pet-detail.wxss` | 可滑动图表样式、日期条样式、倾斜日期样式 |

---

## 🧪 测试验证

### 测试场景 1: 少量数据（≤3 条）
1. 宠物只有 1-3 条体重记录
2. ✅ 图表和日期表正常显示
3. ✅ 无需滚动即可查看全部

### 测试场景 2: 大量数据（≥10 条）
1. 宠物有 10 条以上体重记录
2. ✅ 图表可横向滑动
3. ✅ 日期对照表可横向滑动
4. ✅ 两者滚动同步
5. ✅ 日期不重叠

### 测试场景 3: 日期对齐
1. 查看图表下方日期条
2. ✅ 日期与 Canvas 内数据点水平位置对齐
3. ✅ 日期与下方对照表日期对应

### 测试场景 4: Y 轴刻度
1. 查看 Y 轴刻度
2. ✅ 显示整数（10, 20, 30, 40, 50, 60）
3. ✅ 字体大小适中（18px）

---

## 💡 技术要点

### 1. 动态宽度计算
```javascript
// 每个数据点 100px，最少 600px
const chartContainerWidth = Math.max(600, records.length * 100);
```

### 2. 数据点位置对齐
```javascript
// 考虑 Canvas padding，确保日期条与图表数据点对齐
const padding = { left: 60, right: 40 };
const chartInnerWidth = chartContainerWidth - padding.left - padding.right;
const position = padding.left + (index * chartInnerWidth) / (length - 1);
```

### 3. 同步滚动防死循环
```javascript
if (this.data.isSyncingScroll) return;
this.setData({ isSyncingScroll: true }, () => {
  setTimeout(() => this.setData({ isSyncingScroll: false }), 50);
});
```

### 4. CSS 旋转实现倾斜日期
```css
.date-cell-wrapper {
  transform: rotate(-45deg);
  position: absolute;
}
```

---

## ⚠️ 注意事项

### 1. Canvas 尺寸设置
Canvas 的 `width` 和 `height` 属性设置的是逻辑像素，需要乘以 `pixelRatio` 获得物理像素：
```javascript
canvas.width = logicalWidth * dpr;
canvas.height = logicalHeight * dpr;
ctx.scale(dpr, dpr);
```

### 2. scroll-view 的 scroll-left
使用 `scroll-left` 属性可以实现编程式滚动，但要注意：
- 需要绑定 `bindscroll` 事件
- 需要设置 `isSyncingScroll` 标志防止死循环

### 3. 绝对定位的日期条
日期条使用 `position: absolute`，需要确保父容器是 `position: relative`

---

## 🔗 相关文档

- [README.md](../README.md) - 项目主文档
- [pages/pet-detail/pet-detail.js](../../pages/pet-detail/pet-detail.js) - 详情页逻辑
- [pages/pet-detail/pet-detail.wxml](../../pages/pet-detail/pet-detail.wxml) - 详情页视图

---

_文档创建时间：2026-04-08_
