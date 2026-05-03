// pages/add-pet/add-pet.js
const app = getApp();
const cache = require('../../utils/cache.js');

Page({
  data: {
    petId: '',
    isEdit: false,
    avatarUrl: '',
    petName: '',
    species: '',
    arrivalDate: '',
    initialWeight: '',
    feedInterval: 3,
    subInterval: 15,
    showCustomFeed: false,
    showCustomSub: false,
    customFeedInterval: '',
    customSubInterval: ''
  },

  onLoad(options) {
    // 设置日期选择器最大值（今天）
    const today = app.formatDate(new Date());
    this.setData({ today });
    
    if (options.id) {
      this.setData({ petId: options.id, isEdit: true });
      this.loadPetData();
    }
  },

  // 加载宠物数据（编辑模式）
  async loadPetData() {
    if (!wx.cloud || !this.data.petId) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('pet_info').doc(this.data.petId).get();
      const pet = res.data;

      this.setData({
        avatarUrl: pet.avatar || '',
        petName: pet.name || '',
        species: pet.species || '',
        arrivalDate: pet.arrivalDate || '',
        initialWeight: pet.initialWeight ? String(pet.initialWeight) : '',
        feedInterval: pet.feed_interval || 3,
        subInterval: pet.sub_interval || 15
      });
    } catch (err) {
      console.error('加载宠物数据失败:', err);
    }
  },

  // 选择头像
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.setData({ avatarUrl: tempFilePath });

        // 上传到云存储
        if (wx.cloud) {
          this.uploadAvatar(tempFilePath);
        }
      }
    });
  },

  // 上传头像
  async uploadAvatar(filePath) {
    try {
      const cloudPath = `avatars/${this.data.petId || Date.now()}_${Math.random().toString(36).substr(2, 8)}.png`;
      const res = await wx.cloud.uploadFile({ cloudPath, filePath });
      this.avatarFileId = res.fileID;
    } catch (err) {
      console.error('上传头像失败:', err);
    }
  },

  // 输入处理
  onPetNameInput(e) { this.setData({ petName: e.detail.value }); },
  onSpeciesInput(e) { this.setData({ species: e.detail.value }); },
  onInitialWeightInput(e) { this.setData({ initialWeight: e.detail.value }); },

  // 日期选择（picker）
  onArrivalDateChange(e) {
    console.log('选择的日期:', e.detail.value);
    this.setData({ arrivalDate: e.detail.value });
  },

  // 日期输入（备用方案）
  onArrivalDateInput(e) {
    this.setData({ arrivalDate: e.detail.value });
  },

  // 设置喂食频率
  setFeedInterval(e) {
    const days = e.currentTarget.dataset.days;
    if (days === 'custom') {
      this.setData({ showCustomFeed: true, feedInterval: 0 });
    } else {
      this.setData({ showCustomFeed: false, feedInterval: parseInt(days) });
    }
  },

  // 自定义喂食频率
  onCustomFeedInput(e) {
    this.setData({ customFeedInterval: e.detail.value });
  },

  // 设置垫材频率
  setSubInterval(e) {
    const days = e.currentTarget.dataset.days;
    if (days === 'custom') {
      this.setData({ showCustomSub: true, subInterval: 0 });
    } else {
      this.setData({ showCustomSub: false, subInterval: parseInt(days) });
    }
  },

  // 自定义垫材频率
  onCustomSubInput(e) {
    this.setData({ customSubInterval: e.detail.value });
  },

  // 提交
  async onSubmit() {
    const { petName, species, feedInterval, subInterval, customFeedInterval, customSubInterval } = this.data;

    // 验证必填项
    if (!petName.trim()) {
      wx.showToast({ title: '请输入宠物昵称', icon: 'none' });
      return;
    }
    if (!species.trim()) {
      wx.showToast({ title: '请输入品种', icon: 'none' });
      return;
    }

    const finalFeedInterval = this.data.showCustomFeed ? parseInt(customFeedInterval) || feedInterval : feedInterval;
    const finalSubInterval = this.data.showCustomSub ? parseInt(customSubInterval) || subInterval : subInterval;

    if (finalFeedInterval < 1 || finalSubInterval < 1) {
      wx.showToast({ title: '频率至少为 1 天', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const petData = {
        name: petName.trim(),
        species: species.trim(),
        arrivalDate: this.data.arrivalDate,
        initialWeight: this.data.initialWeight ? parseFloat(this.data.initialWeight) : 0,
        feed_interval: finalFeedInterval,
        sub_interval: finalSubInterval,
        user_openid: app.globalData.openid,
        avatar: this.avatarFileId || this.data.avatarUrl,
        created_at: wx.cloud ? wx.cloud.database().serverDate() : new Date()
        // 注意：不设置 next_feed_date 和 next_sub_date
        // 这两个字段只有在第一次打卡后才会设置
      };

      // 新建和编辑模式都不设置下次日期，等待第一次打卡时设置

      if (wx.cloud) {
        const db = wx.cloud.database();

        if (this.data.isEdit) {
          await db.collection('pet_info').doc(this.data.petId).update({ data: petData });
        } else {
          await db.collection('pet_info').add({ data: petData });
        }
      }

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除宠物
  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，所有记录也会被删除',
      confirmColor: '#E74C3C',
      success: async (res) => {
        if (res.confirm && wx.cloud) {
          try {
            const db = wx.cloud.database();
            await db.collection('pet_info').doc(this.data.petId).remove();
            
            // 清除所有相关缓存
            cache.removeCache('pets');
            cache.removeCache('schedule');
            cache.removeCache('weight');
            cache.removeCache('history');
            
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
