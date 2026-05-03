// pages/mine/mine.js
const app = getApp();

Page({
  data: {
    userInfo: {},
    openid: '',
    tempNickname: '',
    hasUserInfo: false,
    showLoginModal: false,
    stats: {
      petsCount: 0,
      feedCount: 0,
      currentWeight: 0,
      daysCount: 0
    }
  },

  onShow() {
    this.loadUserData();
  },

  // 加载用户数据
  async loadUserData() {
    const openid = app.globalData.openid;
    
    this.setData({
      openid: openid || '未登录'
    });

    // 从数据库加载用户信息
    if (wx.cloud && openid) {
      await this.loadUserInfoFromDB();
      await this.loadStats();
    }
  },

  // 从数据库加载用户信息
  async loadUserInfoFromDB() {
    if (!wx.cloud || !app.globalData.openid) {
      console.log('openid 不存在');
      return;
    }

    try {
      const db = wx.cloud.database();
      
      // 通过 openid 查询用户信息
      const res = await db.collection('user_info')
        .where({ openid: app.globalData.openid })
        .get();

      if (res.data.length > 0 && res.data[0].nickname) {
        this.setData({
          userInfo: res.data[0],
          hasUserInfo: true
        });
        console.log('加载用户信息成功:', res.data[0].nickname);
      } else {
        // 用户信息不存在，自动创建
        this.autoSaveUserInfo();
        this.setData({
          userInfo: { nickname: '爬宠爱好者' },
          hasUserInfo: true
        });
        console.log('自动创建用户信息');
      }
    } catch (err) {
      console.error('用户信息加载失败:', err);
    }
  },

  // 自动保存用户信息（首次打开时）
  async autoSaveUserInfo() {
    const openid = app.globalData.openid;
    if (!openid) return;

    try {
      const db = wx.cloud.database();
      
      // 检查是否已存在
      const existRes = await db.collection('user_info')
        .where({ openid: openid })
        .get();

      if (existRes.data.length === 0) {
        // 首次使用，自动创建用户记录
        const userData = {
          openid: openid,
          nickname: '爬宠爱好者',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        };

        await db.collection('user_info').add({
          data: userData
        });

        this.setData({
          userInfo: userData,
          hasUserInfo: true
        });
        console.log('自动创建用户信息');
      }
    } catch (err) {
      console.error('自动保存用户信息失败:', err);
    }
  },

  // 保存用户信息（保留，但不再使用）
  async onSaveUserInfo() {
    const { tempNickname } = this.data;

    // 验证必填项
    if (!tempNickname || tempNickname.trim() === '') {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    // 检查 openid 是否存在
    const openid = app.globalData.openid;
    if (!openid) {
      wx.showToast({ title: '登录信息丢失，请重试', icon: 'none' });
      console.error('openid 为空，无法保存');
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const db = wx.cloud.database();

      // 先检查是否已存在该 openid 的用户
      const existRes = await db.collection('user_info')
        .where({ openid: openid })
        .get();

      const userData = {
        openid: openid,
        nickname: tempNickname.trim(),
        updatedAt: db.serverDate()
      };

      if (existRes.data.length > 0) {
        // 已存在，更新
        await db.collection('user_info')
          .doc(existRes.data[0]._id)
          .update({
            data: userData
          });
        console.log('用户信息已更新');
      } else {
        // 不存在，创建
        userData.createdAt = db.serverDate();
        await db.collection('user_info').add({
          data: userData
        });
        console.log('用户信息已创建');
      }

      this.setData({
        userInfo: userData,
        hasUserInfo: true,
        showLoginModal: false
      });

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      console.log('用户信息保存成功，昵称:', tempNickname.trim());
    } catch (err) {
      wx.hideLoading();
      console.error('保存用户信息失败:', err);
      wx.showToast({ title: '保存失败：' + err.message, icon: 'none' });
    }
  },

  // 手机号功能已移除

  // 加载统计数据
  async loadStats() {
    if (!wx.cloud || !app.globalData.openid) {
      this.setData({
        stats: {
          petsCount: 0,
          feedCount: 0,
          currentWeight: 0,
          daysCount: 0
        }
      });
      return;
    }

    try {
      const db = wx.cloud.database();
      const openid = app.globalData.openid;

      console.log('加载统计数据，openid:', openid);

      // 1. 获取宠物数量
      const petsRes = await db.collection('pet_info')
        .where({ user_openid: openid })
        .count();
      
      console.log('宠物数量:', petsRes.count);

      // 获取所有宠物
      const pets = await db.collection('pet_info')
        .where({ user_openid: openid })
        .get();
      
      const petIds = pets.data.map(p => p._id);
      
      // 2. 获取总共喂食次数
      let feedCount = 0;
      if (petIds.length > 0) {
        const feedRes = await db.collection('feed_logs')
          .where({ pet_id: db.command.in(petIds) })
          .count();
        feedCount = feedRes.count || 0;
      }
      console.log('喂食次数:', feedCount);

      // 3. 获取目前体重（所有宠物中最新的体重记录）
      let currentWeight = 0;
      if (petIds.length > 0) {
        const weightRes = await db.collection('weight_logs')
          .where({ pet_id: db.command.in(petIds) })
          .orderBy('record_date', 'desc')
          .limit(1)
          .get();
        
        if (weightRes.data.length > 0) {
          currentWeight = weightRes.data[0].weight;
        }
      }
      console.log('当前体重:', currentWeight);

      // 4. 计算总共喂养的天数（从第一只宠物创建到今天）
      let daysCount = 0;
      if (pets.data.length > 0) {
        const petsWithDate = pets.data.filter(p => p.created_at);
        if (petsWithDate.length > 0) {
          const earliestPet = petsWithDate.sort((a, b) => {
            const dateA = typeof a.created_at === 'object' ? a.created_at.value : a.created_at;
            const dateB = typeof b.created_at === 'object' ? b.created_at.value : b.created_at;
            return new Date(dateA) - new Date(dateB);
          })[0];
          
          if (earliestPet) {
            const startDate = new Date(
              typeof earliestPet.created_at === 'object' 
                ? earliestPet.created_at.value 
                : earliestPet.created_at
            );
            const now = new Date();
            daysCount = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
          }
        }
      }
      console.log('喂养天数:', daysCount);

      this.setData({
        stats: {
          petsCount: petsRes.count || 0,
          feedCount: feedCount || 0,
          currentWeight: currentWeight || 0,
          daysCount: daysCount || 0
        }
      });
    } catch (err) {
      console.error('加载统计失败:', err);
      this.setData({
        stats: {
          petsCount: 0,
          feedCount: 0,
          currentWeight: 0,
          daysCount: 0
        }
      });
    }
  },

  // 导出数据
  onExportData() {
    wx.showModal({
      title: '导出数据',
      content: '即将导出所有宠物和记录数据为 JSON 文件',
      success: (res) => {
        if (res.confirm) {
          this.exportData();
        }
      }
    });
  },

  // 导出数据实现
  async exportData() {
    if (!wx.cloud) {
      wx.showToast({ title: '云开发未初始化', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导出中...' });

    try {
      const db = wx.cloud.database();
      const openid = app.globalData.openid;

      // 获取当前用户的宠物 ID 列表
      const petsRes = await db.collection('pet_info').where({ user_openid: openid }).get();
      const petIds = petsRes.data.map(p => p._id);
      
      // 只导出当前用户的数据
      const [pets, feedLogs, weightLogs, subLogs] = await Promise.all([
        petsRes,
        petIds.length > 0 ? db.collection('feed_logs').where({ pet_id: db.command.in(petIds) }).get() : { data: [] },
        petIds.length > 0 ? db.collection('weight_logs').where({ pet_id: db.command.in(petIds) }).get() : { data: [] },
        petIds.length > 0 ? db.collection('substrate_logs').where({ pet_id: db.command.in(petIds) }).get() : { data: [] }
      ]);

      const exportData = {
        exportTime: new Date().toISOString(),
        pets: pets.data,
        feedLogs: feedLogs.data,
        weightLogs: weightLogs.data,
        substrateLogs: subLogs.data
      };

      const fileName = `backup_${openid}_${Date.now()}.json`;
      await wx.cloud.uploadFile({
        cloudPath: `backups/${fileName}`,
        data: JSON.stringify(exportData, null, 2)
      });

      wx.hideLoading();
      wx.showToast({ title: '导出成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('导出失败:', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // 数据备份
  onBackup() {
    wx.showToast({ title: '数据已自动同步到云端', icon: 'success' });
  },

  // 常见问题
  onFAQ() {
    wx.showModal({
      title: '常见问题',
      content: 'Q: 如何添加宠物？\nA: 点击底部"爱宠"Tab，然后点击"添加新宠物"\n\nQ: 如何喂食打卡？\nA: 首页会显示待办事项，点击"打卡"即可\n\nQ: 数据会丢失吗？\nA: 所有数据都保存在微信云开发，不会丢失',
      showCancel: false
    });
  },

  // 关于我们
  onAbout() {
    wx.showModal({
      title: '关于爬宠饲养记',
      content: 'Version 1.0.0\n\n专为爬宠玩家设计的轻量级饲养记录工具。\n\n核心价值：\n• 动态顺延日程\n• 体重成长可视化\n• 科学饲养反馈',
      showCancel: false
    });
  }
});
