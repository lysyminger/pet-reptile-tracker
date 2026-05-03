// pages/index/index.js
const app = getApp();
const cache = require('../../utils/cache.js');

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
    feedDate: ''
  },

  onLoad() {
    this.initDate();
    this.loadFoodOptions();
    this.loadSubstrateOptions();
  },

  onShow() {
    // 强制刷新，不使用缓存
    this.refreshTodayData();
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

  // 加载食物选项
  loadFoodOptions() {
    this.setData({
      foodOptions: app.globalData.foodTypeOptions
    });
  },

  // 加载垫材选项
  loadSubstrateOptions() {
    this.setData({
      substrateOptions: app.globalData.substrateTypeOptions
    });
  },

  // 加载今日数据（使用缓存）
  async loadTodayData() {
    wx.showLoading({ title: '加载中...' });

    try {
      // 1. 获取宠物数据（使用缓存）
      const pets = await this.getPetsWithCache();
      
      console.log('首页加载，宠物数量:', pets.length);
      
      // 2. 获取今日待办
      const todoList = this.calculateTodoList(pets);
      
      // 3. 获取最近记录（使用缓存）
      const recentRecords = await this.getRecentRecordsWithCache();

      // 4. 计算统计数据
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

  // 强制刷新今日数据（不使用缓存）
  async refreshTodayData() {
    wx.showLoading({ title: '刷新中...' });

    try {
      // 1. 强制刷新宠物数据
      const pets = await this.refreshPetsCache();
      
      console.log('首页刷新，宠物数量:', pets.length);
      
      // 2. 获取今日待办
      const todoList = this.calculateTodoList(pets);
      
      // 3. 强制刷新最近记录
      const recentRecords = await this.fetchRecentRecords();
      cache.setCache('history', recentRecords);

      // 4. 计算统计数据
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
      console.error('刷新数据失败:', err);
      wx.showToast({ title: '刷新失败', icon: 'none' });
    } finally {
      wx.hideLoading();
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
    // 1. 先尝试从缓存读取
    const cached = cache.getCache('pets');
    if (cached) {
      return cached;
    }
    
    // 2. 缓存失效，从数据库读取
    const pets = await this.fetchPets();
    
    // 3. 写入缓存
    cache.setCache('pets', pets);
    
    return pets;
  },
  
  // 从数据库获取宠物
  fetchPets() {
    return new Promise((resolve, reject) => {
      if (!wx.cloud) {
        resolve([]);
        return;
      }

      const db = wx.cloud.database();
      db.collection('pet_info')
        .where({ user_openid: app.globalData.openid })
        .get()
        .then(res => resolve(res.data))
        .catch(reject);
    });
  },
  
  // 强制刷新宠物缓存
  async refreshPetsCache() {
    const pets = await this.fetchPets();
    cache.setCache('pets', pets);
    return pets;
  },

  // 计算待办列表
  calculateTodoList(pets) {
    const today = app.formatDate(new Date());
    const todoList = [];

    console.log('calculateTodoList - 输入宠物数:', pets.length);
    console.log('calculateTodoList - 今天日期:', today);

    pets.forEach(pet => {
      console.log('检查宠物:', {
        name: pet.name,
        next_feed_date: pet.next_feed_date,
        next_sub_date: pet.next_sub_date
      });

      // 检查喂食任务（只有设置了 next_feed_date 才显示）
      if (pet.next_feed_date && pet.next_feed_date.indexOf('NaN') === -1 && pet.next_feed_date <= today) {
        const isOverdue = pet.next_feed_date < today;
        const overdueDays = isOverdue ? Math.max(0, app.dateDiff(today, pet.next_feed_date)) : 0;
        
        const todoItem = {
          petId: pet._id,
          petName: pet.name,
          avatar: pet.avatar,
          taskType: 'feed',
          nextDate: pet.next_feed_date,
          isOverdue,
          overdueDays,
          unique: pet._id + '_feed'  // 唯一标识
        };
        
        console.log('添加喂食任务:', todoItem);
        todoList.push(todoItem);
      }

      // 检查垫材任务（只有设置了 next_sub_date 才显示）
      if (pet.next_sub_date && pet.next_sub_date.indexOf('NaN') === -1 && pet.next_sub_date <= today) {
        const isOverdue = pet.next_sub_date < today;
        const overdueDays = isOverdue ? Math.max(0, app.dateDiff(today, pet.next_sub_date)) : 0;
        
        const todoItem = {
          petId: pet._id,
          petName: pet.name,
          avatar: pet.avatar,
          taskType: 'substrate',
          nextDate: pet.next_sub_date,
          isOverdue,
          overdueDays,
          unique: pet._id + '_substrate'  // 唯一标识
        };
        
        console.log('添加垫材任务:', todoItem);
        todoList.push(todoItem);
      }
    });

    // 按逾期程度排序
    todoList.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isOverdue && b.isOverdue) return (b.overdueDays || 0) - (a.overdueDays || 0);
      return a.nextDate.localeCompare(b.nextDate);
    });

    console.log('calculateTodoList - 输出待办数:', todoList.length);
    return todoList;
  },

  // 获取最近记录（带缓存）
  async getRecentRecordsWithCache() {
    // 1. 先尝试从缓存读取
    const cached = cache.getCache('history');
    if (cached) {
      return cached;
    }
    
    // 2. 缓存失效，从数据库读取
    const records = await this.fetchRecentRecords();
    
    // 3. 写入缓存
    cache.setCache('history', records);
    
    return records;
  },
  
  // 从数据库获取最近记录
  async fetchRecentRecords() {
    if (!wx.cloud || !app.globalData.openid) {
      return [];
    }

    try {
      const db = wx.cloud.database();
      const openid = app.globalData.openid;
      
      // 先获取当前用户的宠物 ID 列表
      const petsRes = await db.collection('pet_info')
        .where({ user_openid: openid })
        .get();
      
      const petIds = petsRes.data.map(p => p._id);
      
      if (petIds.length === 0) {
        return [];
      }
      
      // 获取当前用户宠物的喂食记录
      const feedRecords = await db.collection('feed_logs')
        .where({ pet_id: db.command.in(petIds) })
        .orderBy('feed_date', 'desc')
        .limit(5)
        .get();

      // 获取当前用户宠物的垫材记录
      const subRecords = await db.collection('substrate_logs')
        .where({ pet_id: db.command.in(petIds) })
        .orderBy('change_date', 'desc')
        .limit(5)
        .get();

      // 合并记录
      const allRecords = [
        ...feedRecords.data.map(r => ({ ...r, type: 'feed', date: r.feed_date, detail: r.food_type + (r.amount ? ` ${r.amount}` : '') })),
        ...subRecords.data.map(r => ({ ...r, type: 'substrate', date: r.change_date, detail: r.sub_type || '' }))
      ];

      allRecords.sort((a, b) => b.date.localeCompare(a.date));

      // 构建宠物名称映射
      const petMap = {};
      petsRes.data.forEach(p => { petMap[p._id] = p.name; });

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
    if (!wx.cloud) {
      return 0;
    }

    try {
      const db = wx.cloud.database();
      const today = app.formatDate(new Date());
      
      // 获取所有宠物 ID
      const petIds = pets.map(p => p._id);
      
      if (petIds.length === 0) {
        return 0;
      }

      // 查询今日喂食记录
      const feedCount = await db.collection('feed_logs')
        .where({
          pet_id: db.command.in(petIds),
          feed_date: today
        })
        .count();

      // 查询今日垫材记录
      const subCount = await db.collection('substrate_logs')
        .where({
          pet_id: db.command.in(petIds),
          change_date: today
        })
        .count();

      const total = (feedCount.count || 0) + (subCount.count || 0);
      console.log('今日完成统计:', { feedCount: feedCount.count, subCount: subCount.count, total });
      return total;
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
      // 只有设置了 next_feed_date 才计算
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
    
    console.log('onCheckIn 被调用:', { petId, taskType, todoListLength: this.data.todoList.length });
    
    // 获取宠物信息 - 同时匹配 petId 和 taskType
    const pet = this.data.todoList.find(t => 
      String(t.petId) === String(petId) && t.taskType === taskType
    );
    
    if (!pet) {
      console.error('未找到匹配的宠物:', { petId, taskType, todoList: this.data.todoList });
      wx.showToast({ title: '未找到宠物信息', icon: 'none' });
      return;
    }

    console.log('找到宠物:', pet);

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

  // 选择食物
  selectFood(e) {
    this.setData({
      selectedFood: e.currentTarget.dataset.food,
      customFood: ''
    });
  },

  // 食物输入
  onFoodInput(e) {
    this.setData({
      customFood: e.detail.value,
      selectedFood: ''
    });
  },

  // 选择垫材
  selectSubstrate(e) {
    this.setData({
      selectedSubstrate: e.currentTarget.dataset.substrate,
      customSubstrate: ''
    });
  },

  // 垫材输入
  onSubstrateInput(e) {
    this.setData({
      customSubstrate: e.detail.value,
      selectedSubstrate: ''
    });
  },

  // 数量输入
  onAmountInput(e) {
    this.setData({
      feedAmount: e.detail.value
    });
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      feedDate: e.detail.value
    });
  },

  // 关闭弹窗
  closeModal() {
    this.setData({
      showFeedModal: false
    });
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
    
    // 验证打卡日期
    if (!feedDate) {
      wx.showToast({ title: '请选择打卡日期', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '打卡中...' });

    try {
      if (currentTaskType === 'feed') {
        // 喂食打卡
        const foodType = customFood || selectedFood;
        if (!foodType) {
          wx.hideLoading();
          wx.showToast({ title: '请选择食物种类', icon: 'none' });
          return;
        }

        // 添加喂食记录
        await this.addFeedRecord(currentPetId, feedDate, foodType, feedAmount);
        
        // 更新宠物下次喂食日期
        const pet = await this.getPet(currentPetId);
        console.log('获取到的宠物数据:', pet);
        
        // 验证 feed_interval 是否有效
        if (!pet.feed_interval || isNaN(parseInt(pet.feed_interval))) {
          wx.hideLoading();
          wx.showToast({ title: '宠物喂食频率设置无效', icon: 'none' });
          console.error('feed_interval 无效:', pet.feed_interval, '完整宠物数据:', pet);
          return;
        }
        
        const nextDate = app.dateAdd(feedDate, pet.feed_interval);
        await this.updatePet(currentPetId, { next_feed_date: nextDate });
        
        console.log('喂食打卡完成:', {
          petId: currentPetId,
          feedDate,
          interval: pet.feed_interval,
          nextDate
        });
      } else {
        // 垫材打卡
        const subType = customSubstrate || selectedSubstrate;

        // 添加垫材记录
        await this.addSubstrateRecord(currentPetId, feedDate, subType);
        
        // 更新宠物下次垫材日期
        const pet = await this.getPet(currentPetId);
        console.log('获取到的宠物数据:', pet);
        
        // 验证 sub_interval 是否有效
        if (!pet.sub_interval || isNaN(parseInt(pet.sub_interval))) {
          wx.hideLoading();
          wx.showToast({ title: '宠物垫材频率设置无效', icon: 'none' });
          console.error('sub_interval 无效:', pet.sub_interval, '完整宠物数据:', pet);
          return;
        }
        
        const nextDate = app.dateAdd(feedDate, pet.sub_interval);
        await this.updatePet(currentPetId, { next_sub_date: nextDate });
        
        console.log('垫材打卡完成:', {
          petId: currentPetId,
          changeDate: feedDate,
          interval: pet.sub_interval,
          nextDate
        });
      }

      // 清除相关缓存（关键操作后刷新）
      cache.removeCache('pets');
      cache.removeCache('schedule');
      cache.removeCache('history');

      wx.hideLoading();
      wx.showToast({ title: '打卡成功', icon: 'success' });
      this.closeModal();
      
      // 强制刷新数据
      console.log('刷新首页数据...');
      await this.loadTodayData();
    } catch (err) {
      wx.hideLoading();
      console.error('打卡失败:', err);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  },

  // 添加喂食记录
  addFeedRecord(petId, date, foodType, amount) {
    if (!wx.cloud) {
      return Promise.resolve();
    }

    const db = wx.cloud.database();
    return db.collection('feed_logs').add({
      data: {
        pet_id: petId,
        feed_date: date,
        food_type: foodType,
        amount: amount,
        created_at: db.serverDate()
      }
    });
  },

  // 添加垫材记录
  addSubstrateRecord(petId, date, subType) {
    if (!wx.cloud) {
      return Promise.resolve();
    }

    const db = wx.cloud.database();
    return db.collection('substrate_logs').add({
      data: {
        pet_id: petId,
        change_date: date,
        sub_type: subType || '',
        created_at: db.serverDate()
      }
    });
  },

  // 获取宠物信息
  getPet(petId) {
    if (!wx.cloud) {
      return Promise.resolve({ feed_interval: 3, sub_interval: 15 });
    }

    const db = wx.cloud.database();
    return db.collection('pet_info').doc(petId).get()
      .then(res => {
        console.log('getPet 返回:', res.data);
        return res.data;  // 返回 data 字段，而不是整个响应对象
      });
  },

  // 更新宠物信息
  updatePet(petId, data) {
    if (!wx.cloud) {
      return Promise.resolve();
    }

    const db = wx.cloud.database();
    return db.collection('pet_info').doc(petId).update({ data });
  }
});
