// pages/pet-detail/pet-detail.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');
const cats = require('../../utils/petCategories.js');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSigned(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}g`;
}

Page({
  data: {
    petId: '',
    petInfo: {},
    weightRecords: [],
    displayWeightRecords: [],
    historyRecords: [],
    nextFeedDate: '',
    nextSubDate: '',
    isFeedOverdue: false,
    isSubOverdue: false,
    initialWeight: 0,
    currentWeight: 0,
    weightGain: 0,
    chartWidth: 0,
    chartHeight: 400,
    chartContainerWidth: 600,  // 图表容器宽度，根据数据点动态计算
    canvasInstance: null,
    chartScrollLeft: 0,  // 图表滚动位置
    chartZoom: 1,        // 曲线横向缩放倍数（双指捏合调整，0.5~4）
    chartRange: 'all',
    chartRangeOptions: [
      { key: 'all', label: '全部' },
      { key: '30', label: '30天' },
      { key: '90', label: '90天' },
      { key: 'year', label: '今年' }
    ],
    chartRecordText: '0 条记录',
    chartInsight: '',
    chartTooltip: {
      visible: false,
      left: 0,
      top: 0,
      date: '',
      weight: '',
      deltaText: '',
      intervalText: ''
    },
    selectedChartIndex: -1
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ petId: options.id });
      this.loadPetDetail();
    } else {
      wx.showToast({ title: '宠物 ID 无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 初始化 Canvas（在 setData 回调中调用，确保 DOM 已渲染）
  initCanvas() {
    // 如果没有数据，不初始化 Canvas
    if (this.data.displayWeightRecords.length === 0) return;

    // 使用动态计算的图表宽度
    const dynamicWidth = this.data.chartContainerWidth;

    const query = wx.createSelectorQuery();
    query.select('#weightChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res[0] && res[0].node) {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;
          this._dpr = dpr;

          const width = dynamicWidth;
          const height = 400;

          // 设置画布尺寸
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          this.setData({
            chartWidth: width,
            chartHeight: height,
            canvasInstance: canvas
          }, () => {
            if (this.data.displayWeightRecords.length > 0) {
              this.drawWeightChart(this.data.displayWeightRecords, this.data.selectedChartIndex);
            }
          });
        } else {
          console.error('Canvas 节点未找到，res:', res);
        }
      });
  },

  // 加载宠物详情
  async loadPetDetail() {
    wx.showLoading({ title: '加载中...' });

    try {
      // 使用缓存加载数据
      const petInfo = await this.getPetInfoWithCache();
      const weightRecords = await this.getWeightRecordsWithCache();
      const historyRecords = await this.getHistoryRecordsWithCache();

      const today = app.formatDate(new Date());
      
      // 修正：weightRecords 是降序排列，[0] 是最新，最后一个是初始
      const latestWeight = weightRecords.length > 0 ? weightRecords[0].weight : null;
      const earliestWeight = weightRecords.length > 0 ? weightRecords[weightRecords.length - 1].weight : petInfo.initialWeight || 0;
      
      const initialWeight = earliestWeight;
      // 如果没有体重记录，当前体重 = 初始体重
      const currentWeight = latestWeight !== null ? latestWeight : (petInfo.initialWeight || 0);
      
      // 判断是否有喂食/垫材计划（只有打卡后才会有值）
      const hasFeedSchedule = !!petInfo.next_feed_date;
      const hasSubSchedule = !!petInfo.next_sub_date;

      const ascendingWeightRecords = weightRecords.slice().reverse();
      const chartState = this.buildChartState(ascendingWeightRecords, this.data.chartRange, 1);

      const tmpl = cats.getCategory(petInfo.category);

      this.setData({
        petInfo,
        catLabel: cats.categoryDisplay(petInfo.category),
        showSub: !!tmpl.modules.substrate,
        subLabel: tmpl.subLabel || '更换',
        subShort: tmpl.subShort || '垫材',
        weightRecords: ascendingWeightRecords,
        displayWeightRecords: chartState.records,
        chartRecordText: chartState.recordText,
        chartInsight: chartState.insight,
        chartTooltip: Object.assign({}, this.data.chartTooltip, { visible: false }),
        selectedChartIndex: -1,
        chartZoom: 1,
        chartScrollLeft: 0,
        historyRecords,
        nextFeedDate: petInfo.next_feed_date || '',
        nextSubDate: petInfo.next_sub_date || '',
        hasFeedSchedule,
        hasSubSchedule,
        isFeedOverdue: hasFeedSchedule && petInfo.next_feed_date < today,
        isSubOverdue: hasSubSchedule && petInfo.next_sub_date < today,
        initialWeight,
        currentWeight,
        weightGain: currentWeight - initialWeight,
        chartContainerWidth: chartState.width
      }, () => {
        // 在 setData 回调中初始化 Canvas，确保 DOM 渲染完成
        if (this.data.displayWeightRecords.length > 0) {
          this.initCanvas();
        }
      });
    } catch (err) {
      console.error('加载详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 获取宠物信息（带缓存）
  async getPetInfoWithCache() {
    const cached = cache.getCache('pets');
    if (cached && cached.length > 0) {
      const pet = cached.find(p => p._id === this.data.petId);
      if (pet) return pet;
    }
    // 缓存失效，从数据库读取
    return this.fetchPetInfo();
  },
  
  // 从后端获取宠物信息
  fetchPetInfo() {
    return api.get('/pets/' + this.data.petId).catch(err => {
      console.error('fetchPetInfo 失败:', err);
      return {};
    });
  },
  
  // 获取体重记录（带缓存）
  async getWeightRecordsWithCache() {
    const cached = cache.getCache('weight');
    if (cached && cached[this.data.petId]) {
      return cached[this.data.petId];
    }
    // 缓存失效，从数据库读取
    const records = await this.fetchWeightRecords();
    
    // 写入缓存（按宠物 ID 存储）
    const weightCache = cached || {};
    weightCache[this.data.petId] = records;
    cache.setCache('weight', weightCache);
    
    return records;
  },
  
  // 从后端获取体重记录
  fetchWeightRecords() {
    return api.get('/weight-logs', {
      pet_id: this.data.petId,
      order_by: 'record_date_desc'
    }).then(res => Array.isArray(res) ? res : []).catch(err => {
      console.error('fetchWeightRecords 失败:', err);
      return [];
    });
  },
  
  // 获取历史记录（带缓存）。详情页缓存语义：按 petId 分组的对象，存 petHistory。
  async getHistoryRecordsWithCache() {
    const cached = cache.getCache('petHistory');
    if (cached && cached[this.data.petId]) {
      return cached[this.data.petId];
    }
    // 缓存失效，从数据库读取
    const records = await this.fetchHistoryRecords();

    // 写入缓存（按宠物 ID 存储）
    const historyCache = cached || {};
    historyCache[this.data.petId] = records;
    cache.setCache('petHistory', historyCache);

    return records;
  },
  
  // 从后端获取历史记录
  async fetchHistoryRecords() {
    try {
      const petId = this.data.petId;
      const [feedLogs, subLogs, weightLogs] = await Promise.all([
        api.get('/feed-logs',      { pet_id: petId, order_by: 'feed_date_desc',   limit: 10 }),
        api.get('/substrate-logs', { pet_id: petId, order_by: 'change_date_desc', limit: 10 }),
        api.get('/weight-logs',    { pet_id: petId, order_by: 'record_date_desc', limit: 10 })
      ]);

      const records = [
        ...(feedLogs   || []).map(r => ({ id: r._id, type: 'feed',      date: r.feed_date,   detail: `${r.food_type} ${r.amount || ''}` })),
        ...(subLogs    || []).map(r => ({ id: r._id, type: 'substrate', date: r.change_date, detail: r.sub_type || '' })),
        ...(weightLogs || []).map(r => ({ id: r._id, type: 'weight',    date: r.record_date, weight: r.weight }))
      ];
      records.sort((a, b) => b.date.localeCompare(a.date));
      return records.slice(0, 15);
    } catch (err) {
      console.error('fetchHistoryRecords 失败:', err);
      return [];
    }
  },
  
  // 清除当前宠物相关缓存，强制刷新
  clearPetCache() {
    cache.invalidatePetRelatedCache();
  },

  // 图表可视宽度（按屏宽算，留出卡片内边距）；zoom=1 时正好铺满一屏不滚动
  _chartViewport() {
    if (!this._viewport) {
      const sys = wx.getSystemInfoSync();
      const w = sys.windowWidth || 375;
      // 容器(24rpx*2) + 滚动区(20rpx*2) = 88rpx 内边距，换算成 px 后扣掉，确保一屏正好放下
      const padPx = Math.ceil(88 * w / 750);
      this._viewport = Math.max(260, w - padPx);
    }
    return this._viewport;
  },

  buildChartState(records, rangeKey, zoom) {
    const allRecords = Array.isArray(records) ? records : [];
    const filtered = this.filterWeightRecords(allRecords, rangeKey);
    const z = clamp(zoom || this.data.chartZoom || 1, 1, 4);
    const viewport = this._chartViewport();
    // zoom=1 铺满屏幕（全部数据一屏可见）；放大后变宽、可左右滑看细节
    const width = Math.max(viewport, Math.round(viewport * z));
    return {
      records: filtered,
      width,
      recordText: filtered.length === allRecords.length
        ? `${filtered.length} 条记录`
        : `${filtered.length}/${allRecords.length} 条记录`,
      insight: this.buildChartInsight(filtered)
    };
  },

  filterWeightRecords(records, rangeKey) {
    if (!records.length || rangeKey === 'all') return records;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let start = null;

    if (rangeKey === '30' || rangeKey === '90') {
      start = new Date(todayStart);
      start.setDate(start.getDate() - Number(rangeKey));
    } else if (rangeKey === 'year') {
      start = new Date(todayStart.getFullYear(), 0, 1);
    }

    if (!start) return records;
    return records.filter(item => {
      const day = app.toLocalDay(item.record_date);
      return day && day >= start;
    });
  },

  buildChartInsight(records) {
    if (!records.length) return '该范围暂无体重记录';
    if (records.length === 1) return `${records[0].weight}g`;

    const first = Number(records[0].weight) || 0;
    const last = Number(records[records.length - 1].weight) || 0;
    const weights = records.map(r => Number(r.weight) || 0);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    return `${first}g → ${last}g · ${formatSigned(last - first)} · ${min}g-${max}g`;
  },

  onChartRangeTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.chartRange) return;

    const chartState = this.buildChartState(this.data.weightRecords, key, 1);
    this._scrollLeft = 0;
    this.setData({
      chartRange: key,
      chartZoom: 1,
      displayWeightRecords: chartState.records,
      chartRecordText: chartState.recordText,
      chartInsight: chartState.insight,
      chartContainerWidth: chartState.width,
      chartWidth: chartState.width,
      chartTooltip: Object.assign({}, this.data.chartTooltip, { visible: false }),
      selectedChartIndex: -1,
      chartScrollLeft: 0
    }, () => {
      if (this.data.displayWeightRecords.length > 0) this.initCanvas();
    });
  },

  getChartGeometry(records, width, height) {
    const padding = { top: 42, right: 44, bottom: 56, left: 62 };
    if (!records.length) return { padding, minWeight: 0, maxWeight: 0, weightRange: 1, points: [] };

    const weights = records.map(r => Number(r.weight) || 0);
    let minWeight = Math.floor(Math.min(...weights) / 10) * 10;
    let maxWeight = Math.ceil(Math.max(...weights) / 10) * 10;
    if (minWeight === maxWeight) {
      minWeight = Math.max(0, minWeight - 10);
      maxWeight += 10;
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const weightRange = maxWeight - minWeight || 1;
    const points = records.map((item, index) => {
      const x = padding.left + (records.length === 1 ? chartWidth / 2 : (chartWidth * index) / (records.length - 1));
      const weight = Number(item.weight) || 0;
      const y = padding.top + chartHeight - ((weight - minWeight) / weightRange) * chartHeight;
      return { x, y, weight, record: item, index };
    });

    return { padding, minWeight, maxWeight, weightRange, chartWidth, chartHeight, points };
  },

  findNearestChartPoint(x) {
    const geometry = this.getChartGeometry(
      this.data.displayWeightRecords,
      this.data.chartWidth || this.data.chartContainerWidth,
      this.data.chartHeight || 400
    );
    if (!geometry.points.length) return null;
    return geometry.points.reduce((best, point) => {
      return Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best;
    }, geometry.points[0]);
  },

  // scroll-view 上报滚动位置（缩放时据此保持视觉中心，平时不写回 data 避免抖动）
  onChartScroll(e) {
    this._scrollLeft = e.detail.scrollLeft;
  },

  _dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  onChartTouchStart(e) {
    const ts = e.touches || [];
    if (ts.length >= 2) {
      // 双指：进入缩放
      this._pinch = { startDist: this._dist(ts[0], ts[1]) || 1, startZoom: this.data.chartZoom };
      this._touch = null;
      if (this.data.chartTooltip.visible) this._hideTooltip();
      return;
    }
    this._pinch = null;
    const t = ts[0];
    if (t) this._touch = { x: t.x, y: t.y, t: Date.now(), moved: false };
  },

  onChartTouchMove(e) {
    const ts = e.touches || [];
    if (this._pinch && ts.length >= 2) {
      const ratio = this._dist(ts[0], ts[1]) / this._pinch.startDist;
      this._applyZoom(this._pinch.startZoom * ratio, (ts[0].x + ts[1].x) / 2);
      return;
    }
    // 单指：判定为拖动（交给 scroll-view 原生滚动），不弹 tooltip
    if (this._touch) {
      const t = ts[0];
      if (t && !this._touch.moved &&
          (Math.abs(t.x - this._touch.x) > 8 || Math.abs(t.y - this._touch.y) > 8)) {
        this._touch.moved = true;
        if (this.data.chartTooltip.visible) this._hideTooltip();
      }
    }
  },

  onChartTouchEnd() {
    if (this._pinch) { this._pinch = null; return; }
    const t = this._touch;
    this._touch = null;
    if (!t || t.moved) return; // 拖动结束，不处理点按

    // 双击：还原缩放 / 收起明细
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 280) {
      this._lastTap = 0;
      if (this.data.chartZoom > 1) this._applyZoom(1);
      else if (this.data.chartTooltip.visible) this._hideTooltip();
      return;
    }
    this._lastTap = now;

    // 轻点：切换该点明细（再点同一点收起）
    const point = this.findNearestChartPoint(Number(t.x));
    if (!point) return;
    if (this.data.chartTooltip.visible && this.data.selectedChartIndex === point.index) {
      this._hideTooltip();
    } else {
      this._showTooltipAt(point);
    }
  },

  // 应用缩放：重算宽度并保持捏合中心稳定，再清晰重绘
  _applyZoom(zoom, focusX) {
    const z = clamp(Math.round(zoom * 100) / 100, 1, 4);
    if (z === this.data.chartZoom) return;
    const now = Date.now();
    if (this._zoomTs && now - this._zoomTs < 24) return; // 节流，避免每帧重排
    this._zoomTs = now;

    const oldWidth = this.data.chartContainerWidth || 1;
    const state = this.buildChartState(this.data.weightRecords, this.data.chartRange, z);
    const viewport = this._chartViewport();

    // 让捏合中心对应的数据点缩放后仍停在原视觉位置
    const oldScroll = this._scrollLeft || 0;
    const focusContent = focusX != null ? focusX : (oldScroll + viewport / 2);
    let newScroll = Math.round(focusContent * (state.width / oldWidth) - (focusContent - oldScroll));
    newScroll = Math.max(0, Math.min(newScroll, Math.max(0, state.width - viewport)));
    this._scrollLeft = newScroll;

    this.setData({
      chartZoom: z,
      displayWeightRecords: state.records,
      chartRecordText: state.recordText,
      chartContainerWidth: state.width,
      chartWidth: state.width,
      chartScrollLeft: newScroll,
      chartTooltip: Object.assign({}, this.data.chartTooltip, { visible: false }),
      selectedChartIndex: -1
    }, () => this._resizeCanvas(state.width));
  },

  _resizeCanvas(width) {
    const canvas = this.data.canvasInstance;
    if (!canvas) return;
    const dpr = this._dpr || wx.getSystemInfoSync().pixelRatio;
    const height = this.data.chartHeight || 400;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this.drawWeightChart(this.data.displayWeightRecords, this.data.selectedChartIndex);
  },

  _hideTooltip() {
    this.setData({
      chartTooltip: Object.assign({}, this.data.chartTooltip, { visible: false }),
      selectedChartIndex: -1
    }, () => this.drawWeightChart(this.data.displayWeightRecords, -1));
  },

  _showTooltipAt(point) {
    const records = this.data.displayWeightRecords;
    const prev = point.index > 0 ? records[point.index - 1] : null;
    const delta = prev ? point.weight - (Number(prev.weight) || 0) : 0;
    const currentDay = app.toLocalDay(point.record.record_date);
    const prevDay = prev ? app.toLocalDay(prev.record_date) : null;
    const intervalDays = currentDay && prevDay
      ? Math.max(0, Math.round((currentDay - prevDay) / (1000 * 60 * 60 * 24)))
      : 0;
    const tooltipWidth = 170;
    const tooltipHeight = 104;
    const chartWidth = this.data.chartWidth || this.data.chartContainerWidth;
    const chartHeight = this.data.chartHeight || 400;

    this.setData({
      selectedChartIndex: point.index,
      chartTooltip: {
        visible: true,
        left: clamp(point.x + 12, 12, chartWidth - tooltipWidth - 12),
        top: clamp(point.y - tooltipHeight - 8, 12, chartHeight - tooltipHeight - 12),
        date: point.record.record_date,
        weight: `${point.weight}g`,
        deltaText: prev ? formatSigned(delta) : '起点',
        intervalText: prev ? `${intervalDays} 天` : '首次记录'
      }
    }, () => this.drawWeightChart(this.data.displayWeightRecords, point.index));
  },

  // 绘制体重图表
  drawWeightChart(records, selectedIndex) {
    const canvas = this.data.canvasInstance;
    if (!canvas) {
      console.error('❌ Canvas 实例未准备好');
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = this.data.chartWidth || 300;
    const height = this.data.chartHeight || 400;
    ctx.clearRect(0, 0, width, height);
    if (!records || records.length === 0) return;

    const data = records;
    const geometry = this.getChartGeometry(data, width, height);
    const { padding, minWeight, maxWeight, weightRange, chartWidth, chartHeight, points } = geometry;
    const selected = typeof selectedIndex === 'number' ? selectedIndex : -1;
    const weights = points.map(p => p.weight);
    const minActual = Math.min(...weights);
    const maxActual = Math.max(...weights);
    const minIndex = points.findIndex(p => p.weight === minActual);
    const maxIndex = points.findIndex(p => p.weight === maxActual);
    const currentIndex = points.length - 1;
    const initialWeight = Number(this.data.initialWeight) || 0;

    const colors = {
      up: '#2EAD6B',
      down: '#E06B4F',
      flat: '#8A98A8',
      grid: '#EAF0ED',
      text: '#65736E',
      primary: '#4A9C7B',
      fillTop: 'rgba(74, 156, 123, 0.22)',
      fillBottom: 'rgba(74, 156, 123, 0.03)'
    };

    // 绘制网格线和 Y 轴标签
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.strokeStyle = colors.grid;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const weightValue = maxWeight - (weightRange / 5) * i;
      ctx.fillStyle = colors.text;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(weightValue), padding.left - 10, y + 5);
    }

    ctx.fillStyle = colors.text;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('g', padding.left, padding.top - 16);

    if (initialWeight > 0 && initialWeight >= minWeight && initialWeight <= maxWeight) {
      const baseY = padding.top + chartHeight - ((initialWeight - minWeight) / weightRange) * chartHeight;
      ctx.save();
      if (ctx.setLineDash) ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(74, 156, 123, 0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, baseY);
      ctx.lineTo(width - padding.right, baseY);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(74, 156, 123, 0.9)';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('初始 ' + initialWeight + 'g', padding.left + 8, baseY - 8);
    }

    if (points.length > 1) {
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, colors.fillTop);
      gradient.addColorStop(1, colors.fillBottom);

      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.lineTo(points[0].x, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const next = points[i];
        const delta = next.weight - prev.weight;
        ctx.beginPath();
        ctx.strokeStyle = delta > 0 ? colors.up : (delta < 0 ? colors.down : colors.flat);
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
    }

    const labelPoint = (point, label, color, offsetY) => {
      ctx.fillStyle = color;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, point.x, clamp(point.y + offsetY, padding.top + 14, padding.top + chartHeight + 26));
    };

    points.forEach((point, index) => {
      const isSelected = index === selected;
      const isCurrent = index === currentIndex;
      const isMin = index === minIndex;
      const isMax = index === maxIndex;
      const radius = isSelected ? 11 : (isCurrent || isMin || isMax ? 8 : 6);
      const strokeColor = isSelected ? '#1D6F57' : (isCurrent ? colors.primary : '#FFFFFF');

      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = index > 0 && point.weight < points[index - 1].weight ? colors.down : colors.up;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.stroke();

      if (isMax) labelPoint(point, '最高 ' + point.weight + 'g', colors.up, -16);
      if (isMin && minIndex !== maxIndex) labelPoint(point, '最低 ' + point.weight + 'g', colors.down, 24);
      if (isCurrent && currentIndex !== maxIndex && currentIndex !== minIndex) {
        labelPoint(point, '当前 ' + point.weight + 'g', colors.primary, -16);
      }
    });

    if (selected >= 0 && points[selected]) {
      const point = points[selected];
      ctx.save();
      if (ctx.setLineDash) ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(29, 111, 87, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x, padding.top);
      ctx.lineTo(point.x, padding.top + chartHeight);
      ctx.stroke();
      ctx.restore();
    }

    const tickIndexes = points.length <= 2
      ? points.map((_, index) => index)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    const usedTicks = [];
    tickIndexes.forEach(index => {
      if (usedTicks.indexOf(index) >= 0) return;
      usedTicks.push(index);
      const point = points[index];
      ctx.fillStyle = colors.text;
      ctx.font = '17px sans-serif';
      ctx.textAlign = index === 0 ? 'left' : (index === points.length - 1 ? 'right' : 'center');
      ctx.fillText(String(point.record.record_date).slice(5), point.x, height - 22);
    });
  },

  // 喂食打卡
  onFeedCheckIn() {
    wx.navigateTo({
      url: `/pages/weight-record/weight-record?petId=${this.data.petId}&type=feed`
    });
  },

  // 换垫材
  onSubstrateCheckIn() {
    wx.navigateTo({
      url: `/pages/weight-record/weight-record?petId=${this.data.petId}&type=substrate`
    });
  },

  // 记录体重
  onWeightRecord() {
    wx.navigateTo({
      url: `/pages/weight-record/weight-record?petId=${this.data.petId}&type=weight`
    });
  },


  // 预览宠物头像
  onPreviewAvatar() {
    const avatarUrl = this.data.petInfo.avatar || '/assets/images/default-pet.svg';
    
    // 默认图片不预览
    if (avatarUrl.indexOf('default-pet.svg') !== -1) {
      wx.showToast({ title: '默认头像', icon: 'none' });
      return;
    }
    
    wx.previewImage({
      urls: [avatarUrl],
      current: avatarUrl,
      fail: (err) => {
        console.error('头像预览失败:', err);
        wx.showToast({ title: '预览失败', icon: 'none' });
      }
    });
  },

  // 编辑宠物
  onEditPet() {
    wx.navigateTo({
      url: `/pages/add-pet/add-pet?id=${this.data.petId}`
    });
  },

  // 删除记录
  async onDeleteRecord(e) {
    const item = e.currentTarget.dataset.item;
    const { petId } = this.data;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？此操作不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          try {
            const recordId = item.id;
            let endpoint = '';
            if (item.type === 'feed')      endpoint = '/feed-logs/';
            else if (item.type === 'substrate') endpoint = '/substrate-logs/';
            else if (item.type === 'weight')    endpoint = '/weight-logs/';

            if (recordId && endpoint) {
              await api.del(endpoint + recordId);

              if (item.type === 'feed') {
                await this.recalculateNextDate(petId, 'feed');
              } else if (item.type === 'substrate') {
                await this.recalculateNextDate(petId, 'substrate');
              }

              this.clearPetCache();

              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadPetDetail();
            } else {
              wx.hideLoading();
              wx.showToast({ title: '记录 ID 无效', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 重新计算下次日期（删除记录后）
  async recalculateNextDate(petId, type) {
    try {
      const endpoint    = type === 'feed' ? '/feed-logs' : '/substrate-logs';
      const orderBy     = type === 'feed' ? 'feed_date_desc' : 'change_date_desc';
      const dateField   = type === 'feed' ? 'feed_date' : 'change_date';
      const fieldName   = type === 'feed' ? 'next_feed_date' : 'next_sub_date';
      const intervalKey = type === 'feed' ? 'feed_interval' : 'sub_interval';

      const [logs, pet] = await Promise.all([
        api.get(endpoint, { pet_id: petId, order_by: orderBy, limit: 1 }),
        api.get('/pets/' + petId)
      ]);

      const logsArr = Array.isArray(logs) ? logs : [];

      if (logsArr.length > 0) {
        const lastDate = logsArr[0][dateField];
        const nextDate = app.dateAdd(lastDate, pet[intervalKey]);
        await api.put('/pets/' + petId, { [fieldName]: nextDate });
      } else {
        await api.put('/pets/' + petId, { [fieldName]: null });
      }
    } catch (err) {
      console.error('重新计算日期失败:', err);
    }
  },

});
