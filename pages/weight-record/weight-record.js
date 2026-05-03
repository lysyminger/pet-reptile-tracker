// pages/weight-record/weight-record.js
const app = getApp();
const cache = require('../../utils/cache.js');

Page({
  data: {
    petId: '',
    recordType: '', // weight, feed, substrate
    petName: '',
    recordTypeText: '',
    weight: '',
    recordDate: '',
    foodOptions: [],
    substrateOptions: [],
    selectedFood: '',
    customFood: '',
    selectedSubstrate: '',
    customSubstrate: '',
    amount: '',
    recordId: '', // 用于删除的記錄 ID
    canDelete: false // 是否可以删除（用户输入后）
  },

  onLoad(options) {
    console.log('记录页 onLoad options:', options);
    
    const { petId, type, recordId } = options || {};
    
    if (!petId || !type) {
      wx.showToast({ title: '参数无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    this.setData({
      petId,
      recordType: type,
      recordDate: app.formatDate(new Date()),
      foodOptions: app.globalData.foodTypeOptions,
      substrateOptions: app.globalData.substrateTypeOptions,
      recordId: recordId || '',
      canDelete: !!recordId
    });

    // 设置类型文本
    const typeText = { weight: '记录体重', feed: '喂食打卡', substrate: '换垫材打卡' };
    this.setData({ recordTypeText: typeText[type] || '' });

    // 加载宠物名称
    this.loadPetName();
    
    // 如果有 recordId，加载现有记录数据用于编辑/删除
    if (recordId) {
      this.loadExistingRecord(recordId);
    }
  },

  // 加载宠物名称
  async loadPetName() {
    if (!wx.cloud || !this.data.petId) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('pet_info').doc(this.data.petId).get();
      this.setData({ petName: res.data.name });
    } catch (err) {
      console.error('加载宠物名称失败:', err);
    }
  },

  // 加载现有记录数据（用于编辑/删除）
  async loadExistingRecord(recordId) {
    if (!wx.cloud) return;

    try {
      const db = wx.cloud.database();
      const { recordType } = this.data;
      let res = null;

      if (recordType === 'weight') {
        res = await db.collection('weight_logs').doc(recordId).get();
        if (res && res.data) {
          this.setData({
            weight: String(res.data.weight),
            recordDate: res.data.record_date
          });
        }
      } else if (recordType === 'feed') {
        res = await db.collection('feed_logs').doc(recordId).get();
        if (res && res.data) {
          this.setData({
            recordDate: res.data.feed_date,
            selectedFood: res.data.food_type || '',
            amount: res.data.amount || ''
          });
        }
      } else if (recordType === 'substrate') {
        res = await db.collection('substrate_logs').doc(recordId).get();
        if (res && res.data) {
          this.setData({
            recordDate: res.data.change_date,
            selectedSubstrate: res.data.sub_type || ''
          });
        }
      }
    } catch (err) {
      console.error('加载现有记录失败:', err);
    }
  },

  // 体重输入
  onWeightInput(e) {
    this.setData({ weight: e.detail.value });
  },

  // 日期选择
  onDateChange(e) {
    this.setData({ recordDate: e.detail.value });
  },

  // 选择食物
  selectFood(e) {
    this.setData({ selectedFood: e.currentTarget.dataset.food, customFood: '' });
  },

  // 自定义食物
  onCustomFoodInput(e) {
    this.setData({ customFood: e.detail.value, selectedFood: '' });
  },

  // 数量输入
  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  // 选择垫材
  selectSubstrate(e) {
    this.setData({ selectedSubstrate: e.currentTarget.dataset.substrate, customSubstrate: '' });
  },

  // 自定义垫材
  onCustomSubstrateInput(e) {
    this.setData({ customSubstrate: e.detail.value, selectedSubstrate: '' });
  },

  // 提交
  async onSubmit() {
    const { recordType, weight, recordDate, selectedFood, customFood, amount, selectedSubstrate, customSubstrate } = this.data;

    wx.showLoading({ title: '保存中...' });

    try {
      if (!wx.cloud) {
        wx.hideLoading();
        wx.showToast({ title: '云开发未初始化', icon: 'none' });
        return;
      }

      const db = wx.cloud.database();

      if (recordType === 'weight') {
        // 体重记录
        if (!weight || parseFloat(weight) <= 0) {
          wx.hideLoading();
          wx.showToast({ title: '请输入体重', icon: 'none' });
          return;
        }

        await db.collection('weight_logs').add({
          data: {
            pet_id: this.data.petId,
            weight: parseFloat(weight),
            record_date: recordDate,
            created_at: db.serverDate()
          }
        });

      } else if (recordType === 'feed') {
        // 喂食记录
        const foodType = customFood || selectedFood;
        if (!foodType) {
          wx.hideLoading();
          wx.showToast({ title: '请选择食物种类', icon: 'none' });
          return;
        }

        await db.collection('feed_logs').add({
          data: {
            pet_id: this.data.petId,
            feed_date: recordDate,
            food_type: foodType,
            amount: amount,
            created_at: db.serverDate()
          }
        });

        // 更新下次喂食日期
        const pet = await db.collection('pet_info').doc(this.data.petId).get();
        const nextDate = app.dateAdd(recordDate, pet.data.feed_interval);
        await db.collection('pet_info').doc(this.data.petId).update({
          data: { next_feed_date: nextDate }
        });

      } else if (recordType === 'substrate') {
        // 垫材记录
        const subType = customSubstrate || selectedSubstrate;

        await db.collection('substrate_logs').add({
          data: {
            pet_id: this.data.petId,
            change_date: recordDate,
            sub_type: subType || '',
            created_at: db.serverDate()
          }
        });

        // 更新下次垫材日期
        const pet = await db.collection('pet_info').doc(this.data.petId).get();
        const nextDate = app.dateAdd(recordDate, pet.data.sub_interval);
        await db.collection('pet_info').doc(this.data.petId).update({
          data: { next_sub_date: nextDate }
        });
      }

      // 清除相关缓存（关键操作后刷新）
      cache.removeCache('pets');
      cache.removeCache('weight');
      cache.removeCache('history');
      cache.removeCache('schedule');

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除记录
  async onDelete() {
    const { recordId, recordType, petId } = this.data;

    if (!recordId) {
      wx.showToast({ title: '无记录可删除', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？此操作不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          try {
            const db = wx.cloud.database();

            if (recordType === 'weight') {
              await db.collection('weight_logs').doc(recordId).remove();
            } else if (recordType === 'feed') {
              await db.collection('feed_logs').doc(recordId).remove();
              // 如果是喂食记录，需要重新计算下次喂食日期
              await this.recalculateNextFeedDate(petId);
            } else if (recordType === 'substrate') {
              await db.collection('substrate_logs').doc(recordId).remove();
              // 如果是垫材记录，需要重新计算下次垫材日期
              await this.recalculateNextSubDate(petId);
            }

            // 清除所有相关缓存（强制刷新）
            cache.removeCache('pets');
            cache.removeCache('schedule');
            cache.removeCache('weight');
            cache.removeCache('history');

            wx.hideLoading();
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
          } catch (err) {
            wx.hideLoading();
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 重新计算下次喂食日期（删除记录后）
  async recalculateNextFeedDate(petId) {
    try {
      const db = wx.cloud.database();
      
      // 获取该宠物的所有喂食记录（按日期降序）
      const logs = await db.collection('feed_logs')
        .where({ pet_id: petId })
        .orderBy('feed_date', 'desc')
        .limit(1)
        .get();
      
      // 获取宠物信息
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
    } catch (err) {
      console.error('重新计算喂食日期失败:', err);
    }
  },

  // 重新计算下次垫材日期（删除记录后）
  async recalculateNextSubDate(petId) {
    try {
      const db = wx.cloud.database();
      
      // 获取该宠物的所有垫材记录（按日期降序）
      const logs = await db.collection('substrate_logs')
        .where({ pet_id: petId })
        .orderBy('change_date', 'desc')
        .limit(1)
        .get();
      
      // 获取宠物信息
      const pet = await db.collection('pet_info').doc(petId).get();
      
      if (logs.data.length > 0) {
        // 有记录：从最后一次垫材日期重新计算
        const lastSubDate = logs.data[0].change_date;
        const nextDate = app.dateAdd(lastSubDate, pet.data.sub_interval);
        await db.collection('pet_info').doc(petId).update({
          data: { next_sub_date: nextDate }
        });
      } else {
        // 没有记录：清空下次垫材日期
        await db.collection('pet_info').doc(petId).update({
          data: { next_sub_date: null }
        });
      }
    } catch (err) {
      console.error('重新计算垫材日期失败:', err);
    }
  }
});
