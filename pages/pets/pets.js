// pages/pets/pets.js
const app = getApp();
const cache = require('../../utils/cache.js');

Page({
  data: {
    pets: []
  },

  onShow() {
    // 强制刷新，不使用缓存
    this.refreshPetsCache();
  },

  // 加载宠物列表
  async loadPets() {
    wx.showLoading({ title: '加载中...' });

    try {
      // 使用缓存加载宠物数据
      const pets = await this.getPetsWithStatus();
      this.setData({ pets });
    } catch (err) {
      console.error('加载宠物失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  
  // 获取宠物及状态（带缓存）
  async getPetsWithStatus() {
    // 1. 先尝试从缓存读取
    const cached = cache.getCache('pets');
    if (cached) {
      console.log('宠物列表：使用缓存数据');
      // 缓存数据已经包含状态，直接返回
      return cached;
    }
    
    // 2. 缓存失效，从数据库读取并计算状态
    console.log('宠物列表：缓存失效，从数据库读取');
    const pets = await this.fetchPetsWithStatus();
    
    // 3. 写入缓存
    cache.setCache('pets', pets);
    
    return pets;
  },
  
  // 从数据库获取宠物及状态
  async fetchPetsWithStatus() {
    if (!wx.cloud) {
      console.log('云开发未初始化');
      return [];
    }

    const db = wx.cloud.database();
    const today = app.formatDate(new Date());

    // 1. 获取所有宠物
    const petsRes = await db.collection('pet_info')
      .where({ user_openid: app.globalData.openid })
      .get();
    
    const pets = petsRes.data;
    console.log('获取到的宠物数据:', pets);
    
    // 2. 获取最新体重记录
    const weightLogsRes = await db.collection('weight_logs')
      .orderBy('record_date', 'desc')
      .get();
    
    const weightMap = {};
    weightLogsRes.data.forEach(log => {
      if (!weightMap[log.pet_id]) {
        weightMap[log.pet_id] = log.weight;
      }
    });

    // 3. 计算状态
    return pets.map(pet => {
      // === 喂食状态计算 ===
      let feedStatus, feedStatusText;
      
      if (pet.next_feed_date) {
        const nextFeed = pet.next_feed_date;
        
        if (nextFeed > today) {
          feedStatus = 'upcoming';
          const days = Math.ceil((new Date(nextFeed) - new Date(today)) / (1000 * 60 * 60 * 24));
          feedStatusText = `${days}天后`;
        } else if (nextFeed === today) {
          feedStatus = 'today';
          feedStatusText = '今天';
        } else {
          feedStatus = 'overdue';
          const days = Math.ceil((new Date(today) - new Date(nextFeed)) / (1000 * 60 * 60 * 24));
          feedStatusText = `逾期${days}天`;
        }
      } else {
        feedStatus = 'none';
        feedStatusText = '未设置';
      }
      
      // === 垫材状态计算 ===
      let subStatus, subStatusText;
      
      if (pet.next_sub_date) {
        const nextSub = pet.next_sub_date;
        
        if (nextSub > today) {
          subStatus = 'upcoming';
          const days = Math.ceil((new Date(nextSub) - new Date(today)) / (1000 * 60 * 60 * 24));
          subStatusText = `${days}天后`;
        } else if (nextSub === today) {
          subStatus = 'today';
          subStatusText = '今天';
        } else {
          subStatus = 'overdue';
          const days = Math.ceil((new Date(today) - new Date(nextSub)) / (1000 * 60 * 60 * 24));
          subStatusText = `逾期${days}天`;
        }
      } else {
        subStatus = 'none';
        subStatusText = '未设置';
      }

      return {
        ...pet,
        latestWeight: weightMap[pet._id],
        feedStatus,
        feedStatusText,
        subStatus,
        subStatusText
      };
    });
  },
  
  // 强制刷新宠物缓存
  async refreshPetsCache() {
    console.log('强制刷新宠物缓存');
    const pets = await this.fetchPetsWithStatus();
    cache.setCache('pets', pets);
    this.setData({ pets });
    return pets;
  },

  // 获取宠物及状态（优化版）
  async getPetsWithStatus() {
    if (!wx.cloud) {
      console.log('云开发未初始化');
      return [];
    }

    const db = wx.cloud.database();
    const today = app.formatDate(new Date()); // 例如："2026-03-26"

    // 1. 获取所有宠物
    const petsRes = await db.collection('pet_info')
      .where({ user_openid: app.globalData.openid })
      .get();
    
    const pets = petsRes.data;
    console.log('获取到的宠物数据:', pets);
    
    // 2. 获取最新体重记录
    const weightLogsRes = await db.collection('weight_logs')
      .orderBy('record_date', 'desc')
      .get();
    
    const weightMap = {};
    weightLogsRes.data.forEach(log => {
      if (!weightMap[log.pet_id]) {
        weightMap[log.pet_id] = log.weight;
      }
    });

    // 3. 极简状态计算（只依赖 next_feed_date）
    return pets.map(pet => {
      // === 喂食状态计算 ===
      let feedStatus, feedStatusText, hasFeedSchedule = false;
      
      // 只有设置了 next_feed_date 才显示状态
      if (pet.next_feed_date) {
        hasFeedSchedule = true;
        const nextFeed = pet.next_feed_date;
        
        console.log(`宠物 [${pet.name}] 喂食状态:`, {
          nextFeed,
          today,
          compare: nextFeed > today ? '未来' : (nextFeed === today ? '今天' : '过去')
        });
        
        if (nextFeed > today) {
          // 还没到喂食日
          feedStatus = 'upcoming';
          const days = Math.ceil((new Date(nextFeed) - new Date(today)) / (1000 * 60 * 60 * 24));
          feedStatusText = `${days}天后`;
        } else if (nextFeed === today) {
          // 就是今天
          feedStatus = 'today';
          feedStatusText = '今天';
        } else {
          // 逾期了
          feedStatus = 'overdue';
          const days = Math.ceil((new Date(today) - new Date(nextFeed)) / (1000 * 60 * 60 * 24));
          feedStatusText = `逾期${days}天`;
        }
      } else {
        // 未设置喂食计划
        feedStatus = 'none';
        feedStatusText = '未设置';
      }
      
      // === 垫材状态计算（同理）===
      let subStatus, subStatusText, hasSubSchedule = false;
      
      if (pet.next_sub_date) {
        hasSubSchedule = true;
        const nextSub = pet.next_sub_date;
        
        if (nextSub > today) {
          subStatus = 'upcoming';
          const days = Math.ceil((new Date(nextSub) - new Date(today)) / (1000 * 60 * 60 * 24));
          subStatusText = `${days}天后`;
        } else if (nextSub === today) {
          subStatus = 'today';
          subStatusText = '今天';
        } else {
          subStatus = 'overdue';
          const days = Math.ceil((new Date(today) - new Date(nextSub)) / (1000 * 60 * 60 * 24));
          subStatusText = `逾期${days}天`;
        }
      } else {
        // 未设置垫材计划
        subStatus = 'none';
        subStatusText = '未设置';
      }

      return {
        ...pet,
        latestWeight: weightMap[pet._id],
        feedStatus,
        feedStatusText,
        subStatus,
        subStatusText,
        hasFeedSchedule,
        hasSubSchedule
      };
    });
  },

  // 添加宠物
  onAddPet() {
    wx.navigateTo({ url: '/pages/add-pet/add-pet' });
  },

  // 点击宠物
  onPetTap(e) {
    const petId = e.currentTarget.dataset.petid;
    
    if (!petId) {
      wx.showToast({ title: '宠物 ID 无效', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/pet-detail/pet-detail?id=${petId}` });
  }
});
