// pages/weight-record/weight-record.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');

const ENDPOINT = {
  weight:    '/weight-logs',
  feed:      '/feed-logs',
  substrate: '/substrate-logs'
};

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
    recordId: '',
    canDelete: false
  },

  onLoad(options) {
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

    const typeText = { weight: '记录体重', feed: '喂食打卡', substrate: '换垫材打卡' };
    this.setData({ recordTypeText: typeText[type] || '' });

    this.loadPetName();
    if (recordId) this.loadExistingRecord(recordId);
  },

  // 加载宠物名称
  async loadPetName() {
    if (!this.data.petId) return;
    try {
      const pet = await api.get('/pets/' + this.data.petId);
      this.setData({ petName: pet.name || '' });
    } catch (err) {
      console.error('加载宠物名称失败:', err);
    }
  },

  // 加载现有记录数据
  async loadExistingRecord(recordId) {
    try {
      const { recordType } = this.data;
      const endpoint = ENDPOINT[recordType];
      if (!endpoint) return;

      const data = await api.get(endpoint + '/' + recordId);
      if (!data) return;

      if (recordType === 'weight') {
        this.setData({
          weight: String(data.weight),
          recordDate: data.record_date
        });
      } else if (recordType === 'feed') {
        this.setData({
          recordDate: data.feed_date,
          selectedFood: data.food_type || '',
          amount: data.amount || ''
        });
      } else if (recordType === 'substrate') {
        this.setData({
          recordDate: data.change_date,
          selectedSubstrate: data.sub_type || ''
        });
      }
    } catch (err) {
      console.error('加载现有记录失败:', err);
    }
  },

  onWeightInput(e) { this.setData({ weight: e.detail.value }); },
  onDateChange(e)  { this.setData({ recordDate: e.detail.value }); },
  selectFood(e)    { this.setData({ selectedFood: e.currentTarget.dataset.food, customFood: '' }); },
  onCustomFoodInput(e) { this.setData({ customFood: e.detail.value, selectedFood: '' }); },
  onAmountInput(e) { this.setData({ amount: e.detail.value }); },
  selectSubstrate(e)    { this.setData({ selectedSubstrate: e.currentTarget.dataset.substrate, customSubstrate: '' }); },
  onCustomSubstrateInput(e) { this.setData({ customSubstrate: e.detail.value, selectedSubstrate: '' }); },

  // 提交
  async onSubmit() {
    const { recordType, weight, recordDate, selectedFood, customFood, amount, selectedSubstrate, customSubstrate, petId } = this.data;

    wx.showLoading({ title: '保存中...' });

    try {
      if (recordType === 'weight') {
        if (!weight || parseFloat(weight) <= 0) {
          wx.hideLoading();
          wx.showToast({ title: '请输入体重', icon: 'none' });
          return;
        }
        await api.post('/weight-logs', {
          pet_id: petId,
          weight: parseFloat(weight),
          record_date: recordDate
        });

      } else if (recordType === 'feed') {
        const foodType = customFood || selectedFood;
        if (!foodType) {
          wx.hideLoading();
          wx.showToast({ title: '请选择食物种类', icon: 'none' });
          return;
        }

        await api.post('/feed-logs', {
          pet_id: petId,
          feed_date: recordDate,
          food_type: foodType,
          amount: amount || ''
        });

        const pet = await api.get('/pets/' + petId);
        const nextDate = app.dateAdd(recordDate, pet.feed_interval);
        await api.put('/pets/' + petId, { next_feed_date: nextDate });

      } else if (recordType === 'substrate') {
        const subType = customSubstrate || selectedSubstrate;

        await api.post('/substrate-logs', {
          pet_id: petId,
          change_date: recordDate,
          sub_type: subType || ''
        });

        const pet = await api.get('/pets/' + petId);
        const nextDate = app.dateAdd(recordDate, pet.sub_interval);
        await api.put('/pets/' + petId, { next_sub_date: nextDate });
      }

      cache.removeCache('pets');
      cache.removeCache('weight');
      cache.removeCache('history');
      cache.removeCache('schedule');
      cache.removeCache('today');

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
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中...' });
        try {
          const endpoint = ENDPOINT[recordType];
          await api.del(endpoint + '/' + recordId);

          if (recordType === 'feed') {
            await this.recalculateNextFeedDate(petId);
          } else if (recordType === 'substrate') {
            await this.recalculateNextSubDate(petId);
          }

          cache.removeCache('pets');
          cache.removeCache('schedule');
          cache.removeCache('weight');
          cache.removeCache('history');
          cache.removeCache('today');

          wx.hideLoading();
          wx.showToast({ title: '删除成功', icon: 'success' });

          setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              const prevPage = pages[pages.length - 2];
              if (prevPage.onShow) prevPage.onShow();
            }
            wx.navigateBack();
          }, 1500);
        } catch (err) {
          wx.hideLoading();
          console.error('删除失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  async recalculateNextFeedDate(petId) {
    try {
      const [logs, pet] = await Promise.all([
        api.get('/feed-logs', { pet_id: petId, order_by: 'feed_date_desc', limit: 1 }),
        api.get('/pets/' + petId)
      ]);
      const logsArr = Array.isArray(logs) ? logs : [];
      if (logsArr.length > 0) {
        const nextDate = app.dateAdd(logsArr[0].feed_date, pet.feed_interval);
        await api.put('/pets/' + petId, { next_feed_date: nextDate });
      } else {
        await api.put('/pets/' + petId, { next_feed_date: null });
      }
    } catch (err) {
      console.error('重新计算喂食日期失败:', err);
    }
  },

  async recalculateNextSubDate(petId) {
    try {
      const [logs, pet] = await Promise.all([
        api.get('/substrate-logs', { pet_id: petId, order_by: 'change_date_desc', limit: 1 }),
        api.get('/pets/' + petId)
      ]);
      const logsArr = Array.isArray(logs) ? logs : [];
      if (logsArr.length > 0) {
        const nextDate = app.dateAdd(logsArr[0].change_date, pet.sub_interval);
        await api.put('/pets/' + petId, { next_sub_date: nextDate });
      } else {
        await api.put('/pets/' + petId, { next_sub_date: null });
      }
    } catch (err) {
      console.error('重新计算垫材日期失败:', err);
    }
  }
});
