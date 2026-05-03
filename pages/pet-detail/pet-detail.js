// pages/pet-detail/pet-detail.js
const app = getApp();
const cache = require('../../utils/cache.js');

Page({
  data: {
    petId: '',
    petInfo: {},
    weightRecords: [],
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
    isSyncingScroll: false,  // 防止滚动同步死循环
    chartScrollLeft: 0,  // 图表滚动位置
    tableScrollLeft: 0,   // 日期表滚动位置
    chartDataPoints: []   // 图表数据点位置（用于日期条对齐）
  },

  onLoad(options) {
    console.log('详情页 onLoad options:', options);
    
    if (options && options.id) {
      this.setData({ petId: options.id });
      this.loadPetDetail();
    } else {
      wx.showToast({ title: '宠物 ID 无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 数据加载完成后检查 Canvas（已废弃，使用 setData 回调）
  // checkCanvas() { ... },

  onReady() {
    // Canvas 已在 setData 回调中初始化，这里不需要做任何事
  },

  // 初始化 Canvas（在 setData 回调中调用，确保 DOM 已渲染）
  initCanvas() {
    console.log('initCanvas 执行，weightRecords:', this.data.weightRecords.length);

    // 如果没有数据，不初始化 Canvas
    if (this.data.weightRecords.length === 0) {
      console.log('暂无体重记录，跳过 Canvas 初始化');
      return;
    }

    // 使用动态计算的图表宽度
    const dynamicWidth = this.data.chartContainerWidth;

    // 直接查询 Canvas，不需要 setTimeout
    const query = wx.createSelectorQuery();
    query.select('#weightChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        console.log('Canvas 查询结果:', res);
        if (res[0] && res[0].node) {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;

          const width = dynamicWidth;
          const height = 400;

          console.log('Canvas 尺寸:', { width, height, dpr });

          // 设置画布尺寸
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          this.setData({
            chartWidth: width,
            chartHeight: height,
            canvasInstance: canvas
          }, () => {
            console.log('Canvas 实例已设置，宽度:', this.data.chartWidth);

            // 绘制图表
            if (this.data.weightRecords.length > 0) {
              console.log('绘制图表，记录数:', this.data.weightRecords.length);
              this.drawWeightChart(this.data.weightRecords);
            }
          });
        } else {
          console.error('❌ Canvas 节点未找到，res:', res);
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

      console.log('体重数据:', {
        earliestWeight,
        latestWeight,
        petInfoInitialWeight: petInfo.initialWeight,
        weightRecordsCount: weightRecords.length,
        currentWeight
      });

      // 设置数据，在回调中初始化 Canvas（确保 DOM 已渲染）
      // 注意：weightRecords 保持降序（最新在前），但在 drawWeightChart 中会反转用于绘图
      // 日期对照表显示全部记录，按时间正序（从左到右 = 从早到晚）
      const chartContainerWidth = Math.max(600, weightRecords.length * 100);  // 每个数据点至少 100px 宽度，最少 600px

      // 计算图表中每个数据点的 X 位置（用于日期条对齐）
      // Canvas 内图表区域有 padding: left=60, right=40
      const padding = { left: 60, right: 40 };
      const chartInnerWidth = chartContainerWidth - padding.left - padding.right;
      const chartDataPoints = weightRecords.map((_, index) => ({
        position: padding.left + (index * chartInnerWidth) / (weightRecords.length > 1 ? weightRecords.length - 1 : 1)
      }));

      this.setData({
        petInfo,
        weightRecords: weightRecords.slice().reverse(),  // 反转为正序，最早的在前
        chartDataPoints,  // 图表数据点位置
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
        chartContainerWidth  // 设置图表容器宽度
      }, () => {
        console.log('setData 完成，DOM 已渲染');
        // 在 setData 回调中初始化 Canvas，确保 100% 渲染完成
        if (this.data.weightRecords.length > 0) {
          console.log('有体重记录，初始化 Canvas');
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
      if (pet) {
        console.log('宠物信息：使用缓存');
        return pet;
      }
    }
    
    // 缓存失效，从数据库读取
    console.log('宠物信息：缓存失效，从数据库读取');
    const pet = await this.fetchPetInfo();
    return pet;
  },
  
  // 从数据库获取宠物信息
  fetchPetInfo() {
    if (!wx.cloud) {
      return Promise.resolve({});
    }

    const db = wx.cloud.database();
    return db.collection('pet_info').doc(this.data.petId).get().then(res => res.data);
  },
  
  // 获取体重记录（带缓存）
  async getWeightRecordsWithCache() {
    const cached = cache.getCache('weight');
    if (cached && cached[this.data.petId]) {
      console.log('体重记录：使用缓存');
      return cached[this.data.petId];
    }
    
    // 缓存失效，从数据库读取
    console.log('体重记录：缓存失效，从数据库读取');
    const records = await this.fetchWeightRecords();
    
    // 写入缓存（按宠物 ID 存储）
    const weightCache = cached || {};
    weightCache[this.data.petId] = records;
    cache.setCache('weight', weightCache);
    
    return records;
  },
  
  // 从数据库获取体重记录
  fetchWeightRecords() {
    if (!wx.cloud) {
      return Promise.resolve([]);
    }

    const db = wx.cloud.database();
    return db.collection('weight_logs')
      .where({ pet_id: this.data.petId })
      .orderBy('record_date', 'desc')
      .get()
      .then(res => res.data);
  },
  
  // 获取历史记录（带缓存）
  async getHistoryRecordsWithCache() {
    const cached = cache.getCache('history');
    if (cached && cached[this.data.petId]) {
      console.log('历史记录：使用缓存');
      return cached[this.data.petId];
    }
    
    // 缓存失效，从数据库读取
    console.log('历史记录：缓存失效，从数据库读取');
    const records = await this.fetchHistoryRecords();
    
    // 写入缓存（按宠物 ID 存储）
    const historyCache = cached || {};
    historyCache[this.data.petId] = records;
    cache.setCache('history', historyCache);
    
    return records;
  },
  
  // 从数据库获取历史记录
  async fetchHistoryRecords() {
    if (!wx.cloud) {
      return Promise.resolve([]);
    }

    const db = wx.cloud.database();
    
    const [feedLogs, subLogs, weightLogs] = await Promise.all([
      db.collection('feed_logs').where({ pet_id: this.data.petId }).orderBy('feed_date', 'desc').limit(10).get(),
      db.collection('substrate_logs').where({ pet_id: this.data.petId }).orderBy('change_date', 'desc').limit(10).get(),
      db.collection('weight_logs').where({ pet_id: this.data.petId }).orderBy('record_date', 'desc').limit(10).get()
    ]);

    const records = [
      ...feedLogs.data.map(r => ({ id: r._id, type: 'feed', date: r.feed_date, detail: `${r.food_type} ${r.amount || ''}` })),
      ...subLogs.data.map(r => ({ id: r._id, type: 'substrate', date: r.change_date, detail: r.sub_type || '' })),
      ...weightLogs.data.map(r => ({ id: r._id, type: 'weight', date: r.record_date, weight: r.weight }))
    ];

    records.sort((a, b) => b.date.localeCompare(a.date));
    return records.slice(0, 15);
  },
  
  // 清除当前宠物的缓存
  clearPetCache() {
    // 清除所有缓存，强制刷新
    cache.removeCache('pets');
    cache.removeCache('weight');
    cache.removeCache('history');
    cache.removeCache('schedule');
  },

  // 绘制体重图表
  drawWeightChart(records) {
    const canvas = this.data.canvasInstance;
    if (!canvas) {
      console.error('❌ Canvas 实例未准备好');
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = this.data.chartWidth || 300;
    const height = this.data.chartHeight || 400;
    const padding = { top: 50, right: 40, bottom: 20, left: 60 };  // 底部 padding 减少，因为不需要画 X 轴标签

    console.log('✅ 开始绘制图表，记录数:', records.length, '画布:', width, 'x', height);
    
    // 测试：先画一个红色方块，验证 Canvas 是否可见
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(10, 10, 50, 50);
    console.log('🔴 绘制了红色测试方块 (10,10,50,50)');

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 准备数据（全部显示）
    const data = records;
    const weights = data.map(r => r.weight);
    // Y 轴刻度改为整数（10 的倍数）
    const minWeight = Math.floor(Math.min(...weights) / 10) * 10;
    const maxWeight = Math.ceil(Math.max(...weights) / 10) * 10;
    const weightRange = maxWeight - minWeight || 1;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xStep = chartWidth / (data.length - 1 || 1);

    console.log('图表参数:', {
      width, height, chartWidth, chartHeight, xStep,
      minWeight, maxWeight, weightRange,
      dataPoints: data.length
    });

    // 绘制网格线和 Y 轴标签
    ctx.strokeStyle = '#EEEEEE';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y 轴标签（整数，字体变小）
      const weightValue = maxWeight - (weightRange / 5) * i;
      ctx.fillStyle = '#666666';
      ctx.font = '18px sans-serif';  // 字体从 25px 改为 18px
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(weightValue), padding.left - 10, y + 5);  // 取整数
    }

    // 绘制折线
    ctx.beginPath();
    ctx.strokeStyle = '#4A9C7B';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    data.forEach((item, index) => {
      const x = padding.left + xStep * index;
      const y = padding.top + chartHeight - ((item.weight - minWeight) / weightRange) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 绘制渐变填充
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, 'rgba(74, 156, 123, 0.3)');
    gradient.addColorStop(1, 'rgba(74, 156, 123, 0.05)');

    ctx.lineTo(padding.left + xStep * (data.length - 1), height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

// 绘制数据点
    data.forEach((item, index) => {
      const x = padding.left + xStep * index;
      const y = padding.top + chartHeight - ((item.weight - minWeight) / weightRange) * chartHeight;

      // 外圈
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#4A9C7B';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 内点
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#4A9C7B';
      ctx.fill();

      // X 轴标签已移除，改为在下方日期对照表中显示
    });
    // 标题
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 25px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('体重变化趋势 (g)', width / 2, 30);

    console.log('✅ 图表绘制完成');
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
      success: () => {
        console.log('头像预览成功');
      },
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
            const db = wx.cloud.database();
            
            // 根据类型删除对应集合的记录（使用记录 ID）
            let collection = '';
            let recordId = item.id;
            
            if (item.type === 'feed') {
              collection = 'feed_logs';
            } else if (item.type === 'substrate') {
              collection = 'substrate_logs';
            } else if (item.type === 'weight') {
              collection = 'weight_logs';
            }

            if (recordId) {
              await db.collection(collection).doc(recordId).remove();
              
              // 删除后重新计算下次日期
              if (item.type === 'feed') {
                await this.recalculateNextDate(petId, 'feed');
              } else if (item.type === 'substrate') {
                await this.recalculateNextDate(petId, 'substrate');
              }
              
              // 清除所有缓存
              this.clearPetCache();
              
              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success' });
              
              // 重新加载数据
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
      const db = wx.cloud.database();
      
      // 获取该宠物的所有对应记录（按日期降序）
      const logs = await db.collection(type === 'feed' ? 'feed_logs' : 'substrate_logs')
        .where({ pet_id: petId })
        .orderBy(type === 'feed' ? 'feed_date' : 'change_date', 'desc')
        .limit(1)
        .get();
      
      // 获取宠物信息
      const pet = await db.collection('pet_info').doc(petId).get();
      
      const fieldName = type === 'feed' ? 'next_feed_date' : 'next_sub_date';
      const intervalField = type === 'feed' ? 'feed_interval' : 'sub_interval';
      const dateField = type === 'feed' ? 'feed_date' : 'change_date';
      
      if (logs.data.length > 0) {
        // 有记录：从最后一次日期重新计算
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
    } catch (err) {
      console.error('重新计算日期失败:', err);
    }
  },

  // 图表滚动事件
  onChartScroll(e) {
    if (this.data.isSyncingScroll) return;

    this.setData({
      isSyncingScroll: true,
      tableScrollLeft: e.detail.scrollLeft
    }, () => {
      // 延迟重置，避免频繁触发
      setTimeout(() => {
        this.setData({ isSyncingScroll: false });
      }, 50);
    });
  },

  // 日期表滚动事件
  onDateTableScroll(e) {
    if (this.data.isSyncingScroll) return;

    this.setData({
      isSyncingScroll: true,
      // 图表和日期表的宽度比例可能不同，需要按比例同步
      chartScrollLeft: e.detail.scrollLeft * (this.data.chartContainerWidth / (this.data.weightRecords.length * 100))
    }, () => {
      setTimeout(() => {
        this.setData({ isSyncingScroll: false });
      }, 50);
    });
  }
});
