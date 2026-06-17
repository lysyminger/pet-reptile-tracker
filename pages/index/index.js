// pages/index/index.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');
const whatsNew = require('../../utils/whatsNew.js');
const imageCache = require('../../utils/imageCache.js');

Page({
  data: {
    currentDate: '',
    weekday: '',
    weather: '',
    todoCount: 0,
    completedCount: 0,
    petsCount: 0,
    todoList: [],
    recentRecords: [],
    relaxInfo: null,
    showFeedModal: false,
    currentPetId: '',
    currentPetName: '',
    currentTaskType: '',
    foodOptions: [],
    substrateOptions: [],
    selectedFood: '',
    customFood: '',
    selectedSubstrate: '',
    customSubstrate: '',
    feedAmount: '',
    feedDate: '',
    recentPhotos: []
  },

  onLoad() {
    this.initDate();
    this.loadFoodOptions();
    this.loadSubstrateOptions();
    whatsNew.maybeShow(); // 版本更新提示（每个版本只弹一次）
  },

  onShow() {
    // 优先用今日快照缓存（60s）：切 tab 时秒显、不查库；过期或刚打卡才刷新
    this.renderTodaySmart();
    this.loadRecentPhotos();
  },

  // 命中今日快照则直接渲染（零网络）；否则刷新
  async renderTodaySmart() {
    const today = app.formatDate(new Date());
    const snap = cache.getCache('today');
    if (snap && snap.date === today && snap.view) {
      this.setData(snap.view);
      return;
    }
    // 快照缺失：若宠物缓存还在则静默刷新（无 loading），否则冷启动显示 loading
    const silent = !!cache.getCache('pets');
    await this.refreshTodayData(silent);
  },

  // 首页「成长相册」最近几张缩略图（走本地缓存，不重复拉服务器）
  async loadRecentPhotos() {
    try {
      const list = await api.get('/pet-photos', { limit: 8 });
      const photos = (Array.isArray(list) ? list : []).map(p => ({
        _id: p._id,
        thumb: p.thumb_url || p.url,
        localThumb: p.thumb_url || p.url
      }));
      this.setData({ recentPhotos: photos });
      photos.forEach((p, i) => {
        imageCache.ensureLocal(p.thumb).then(local => {
          if (local && local !== p.localThumb) {
            this.setData({ [`recentPhotos[${i}].localThumb`]: local });
          }
        });
      });
    } catch (e) { /* 静默：相册非核心，失败不打扰 */ }
  },

  onOpenGallery() {
    wx.switchTab({ url: '/pages/pet-gallery/pet-gallery' });
  },

  // 初始化日期
  initDate() {
    const now = new Date();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    this.setData({
      currentDate: `${month}/${day}`,
      weekday: weekdays[now.getDay()]
    });
  },

  loadFoodOptions() {
    this.setData({ foodOptions: app.globalData.foodTypeOptions });
  },

  loadSubstrateOptions() {
    this.setData({ substrateOptions: app.globalData.substrateTypeOptions });
  },

  // 加载今日数据（使用缓存）
  async loadTodayData() {
    wx.showLoading({ title: '加载中...' });
    try {
      const pets = await this.getPetsWithCache();
      const todoList = this.calculateTodoList(pets);
      const recentRecords = await this.getRecentRecordsWithCache(pets);

      const todoCount = todoList.length;
      const completedCount = await this.getTodayCompletedCount(pets);
      const relaxInfo = todoCount === 0 ? this.calculateRelaxInfo(pets) : null;

      this.setData({
        petsCount: pets.length,
        todoList,
        todoCount,
        completedCount,
        recentRecords,
        relaxInfo
      });
    } catch (err) {
      console.error('加载数据失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 刷新今日数据。silent=true 时不显示 loading（用缓存快速刷新）
  async refreshTodayData(silent) {
    if (!silent) wx.showLoading({ title: '加载中...' });
    try {
      const pets = await this.getPetsWithCache();
      const todoList = this.calculateTodoList(pets);

      const recentRecords = await this.getRecentRecordsWithCache(pets);

      const todoCount = todoList.length;
      const completedCount = await this.getTodayCompletedCount(pets);
      const relaxInfo = todoCount === 0 ? this.calculateRelaxInfo(pets) : null;

      const view = {
        petsCount: pets.length,
        todoList,
        todoCount,
        completedCount,
        recentRecords,
        relaxInfo
      };
      this.setData(view);
      // 存今日快照，60s 内切 tab 直接复用、不再查库
      cache.setCache('today', { date: app.formatDate(new Date()), view });
    } catch (err) {
      console.error('刷新数据失败:', err);
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      if (!silent) wx.hideLoading();
    }
  },

  // 强制刷新宠物缓存
  async refreshPetsCache() {
    const pets = await this.fetchPets();
    cache.setCache('pets', pets);
    return pets;
  },

  // 获取宠物数据（带缓存）
  async getPetsWithCache() {
    const cached = cache.getCache('pets');
    if (cached) return cached;
    const pets = await this.fetchPets();
    cache.setCache('pets', pets);
    return pets;
  },

  // 从后端获取宠物
  async fetchPets() {
    try {
      const res = await api.get('/pets');
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.error('fetchPets 失败:', err);
      return [];
    }
  },

  // 计算待办列表
  calculateTodoList(pets) {
    const today = app.formatDate(new Date());
    const todoList = [];

    pets.forEach(pet => {
      if (pet.next_feed_date && pet.next_feed_date.indexOf('NaN') === -1 && pet.next_feed_date <= today) {
        const isOverdue = pet.next_feed_date < today;
        const overdueDays = isOverdue ? Math.max(0, app.dateDiff(today, pet.next_feed_date)) : 0;
        todoList.push({
          petId: pet._id,
          petName: pet.name,
          avatar: pet.avatar,
          taskType: 'feed',
          nextDate: pet.next_feed_date,
          isOverdue,
          overdueDays,
          unique: pet._id + '_feed'
        });
      }

      if (pet.next_sub_date && pet.next_sub_date.indexOf('NaN') === -1 && pet.next_sub_date <= today) {
        const isOverdue = pet.next_sub_date < today;
        const overdueDays = isOverdue ? Math.max(0, app.dateDiff(today, pet.next_sub_date)) : 0;
        todoList.push({
          petId: pet._id,
          petName: pet.name,
          avatar: pet.avatar,
          taskType: 'substrate',
          nextDate: pet.next_sub_date,
          isOverdue,
          overdueDays,
          unique: pet._id + '_substrate'
        });
      }
    });

    todoList.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isOverdue && b.isOverdue) return (b.overdueDays || 0) - (a.overdueDays || 0);
      return a.nextDate.localeCompare(b.nextDate);
    });

    return todoList;
  },

  // 获取最近记录（带缓存）
  async getRecentRecordsWithCache(pets) {
    const cached = cache.getCache('recentHistory');
    if (cached) return cached;
    const records = await this.fetchRecentRecords(pets);
    cache.setCache('recentHistory', records);
    return records;
  },

  // 从后端获取最近记录
  async fetchRecentRecords(pets) {
    try {
      const petsArr = pets || await this.fetchPets();
      const petIds = petsArr.map(p => p._id);
      if (petIds.length === 0) return [];

      const petIdsStr = petIds.join(',');
      const [feedRecords, subRecords] = await Promise.all([
        api.get('/feed-logs', { pet_ids: petIdsStr, order_by: 'feed_date_desc', limit: 5 }),
        api.get('/substrate-logs', { pet_ids: petIdsStr, order_by: 'change_date_desc', limit: 5 })
      ]);

      const allRecords = [
        ...(feedRecords || []).map(r => ({ ...r, type: 'feed', date: r.feed_date, detail: r.food_type + (r.amount ? ` ${r.amount}` : '') })),
        ...(subRecords  || []).map(r => ({ ...r, type: 'substrate', date: r.change_date, detail: r.sub_type || '' }))
      ];
      allRecords.sort((a, b) => b.date.localeCompare(a.date));

      const petMap = {};
      petsArr.forEach(p => { petMap[p._id] = p.name; });

      return allRecords.slice(0, 5).map(r => ({
        ...r,
        petName: petMap[r.pet_id] || '未知宠物'
      }));
    } catch (err) {
      console.error('获取记录失败:', err);
      return [];
    }
  },

  // 获取今日完成数量
  async getTodayCompletedCount(pets) {
    try {
      const petIds = pets.map(p => p._id);
      if (petIds.length === 0) return 0;
      const today = app.formatDate(new Date());
      const petIdsStr = petIds.join(',');

      const [feedRes, subRes] = await Promise.all([
        api.get('/feed-logs/count', { pet_ids: petIdsStr, feed_date: today }),
        api.get('/substrate-logs/count', { pet_ids: petIdsStr, change_date: today })
      ]);

      return ((feedRes && feedRes.count) || 0) + ((subRes && subRes.count) || 0);
    } catch (err) {
      console.error('获取完成数失败:', err);
      return 0;
    }
  },

  // 计算清闲信息
  calculateRelaxInfo(pets) {
    if (pets.length === 0) return null;
    let minDays = Infinity;
    let petName = '';
    pets.forEach(pet => {
      if (pet.next_feed_date && pet.next_feed_date.indexOf('NaN') === -1) {
        const feedDays = app.dateDiff(pet.next_feed_date, app.formatDate(new Date()));
        if (feedDays > 0 && feedDays < minDays) {
          minDays = feedDays;
          petName = pet.name;
        }
      }
    });
    return minDays === Infinity ? null : { days: minDays, petName };
  },

  // 打卡按钮点击
  onCheckIn(e) {
    const { petId, taskType } = e.currentTarget.dataset;
    const pet = this.data.todoList.find(t =>
      String(t.petId) === String(petId) && t.taskType === taskType
    );
    if (!pet) {
      wx.showToast({ title: '未找到宠物信息', icon: 'none' });
      return;
    }

    this.setData({
      currentPetId: petId,
      currentPetName: pet.petName,
      currentTaskType: taskType,
      selectedFood: '',
      customFood: '',
      selectedSubstrate: '',
      customSubstrate: '',
      feedAmount: '',
      feedDate: app.formatDate(new Date()),
      showFeedModal: true
    });
  },

  selectFood(e) {
    this.setData({ selectedFood: e.currentTarget.dataset.food, customFood: '' });
  },
  onFoodInput(e) {
    this.setData({ customFood: e.detail.value, selectedFood: '' });
  },
  selectSubstrate(e) {
    this.setData({ selectedSubstrate: e.currentTarget.dataset.substrate, customSubstrate: '' });
  },
  onSubstrateInput(e) {
    this.setData({ customSubstrate: e.detail.value, selectedSubstrate: '' });
  },
  onAmountInput(e) {
    this.setData({ feedAmount: e.detail.value });
  },
  onDateChange(e) {
    this.setData({ feedDate: e.detail.value });
  },
  closeModal() {
    this.setData({ showFeedModal: false });
  },

  // 确认打卡
  async confirmFeed() {
    const {
      currentPetId,
      currentTaskType,
      selectedFood,
      customFood,
      selectedSubstrate,
      customSubstrate,
      feedAmount,
      feedDate
    } = this.data;

    if (!feedDate) {
      wx.showToast({ title: '请选择打卡日期', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '打卡中...' });

    try {
      // 原子接口：写日志 + 更新下次计划日期在后端一个事务里完成
      if (currentTaskType === 'feed') {
        const foodType = customFood || selectedFood;
        if (!foodType) {
          wx.hideLoading();
          wx.showToast({ title: '请选择食物种类', icon: 'none' });
          return;
        }
        await api.post('/check-ins/feed', {
          pet_id: currentPetId,
          feed_date: feedDate,
          food_type: foodType,
          amount: feedAmount || ''
        });
      } else {
        const subType = customSubstrate || selectedSubstrate;
        await api.post('/check-ins/substrate', {
          pet_id: currentPetId,
          change_date: feedDate,
          sub_type: subType || ''
        });
      }

      cache.invalidatePetRelatedCache();

      wx.hideLoading();
      wx.showToast({ title: '打卡成功', icon: 'success' });
      this.closeModal();

      await this.refreshTodayData();
    } catch (err) {
      wx.hideLoading();
      console.error('打卡失败:', err);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  }
});
