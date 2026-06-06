// pages/add-pet/add-pet.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');

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
    const today = app.formatDate(new Date());
    this.setData({ today });

    if (options.id) {
      this.setData({ petId: options.id, isEdit: true });
      this.loadPetData();
    }
  },

  // 加载宠物数据（编辑模式）
  async loadPetData() {
    if (!this.data.petId) return;
    try {
      const pet = await api.get('/pets/' + this.data.petId);
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
        this.uploadAvatar(tempFilePath);
      }
    });
  },

  // 上传头像到自建后端
  async uploadAvatar(filePath) {
    try {
      const res = await api.uploadFile(filePath, 'file');
      if (res && res.url) {
        this.uploadedAvatarUrl = res.url;
        this.setData({ avatarUrl: res.url });
      }
    } catch (err) {
      console.error('上传头像失败:', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    }
  },

  onPetNameInput(e) { this.setData({ petName: e.detail.value }); },
  onSpeciesInput(e) { this.setData({ species: e.detail.value }); },
  onInitialWeightInput(e) { this.setData({ initialWeight: e.detail.value }); },

  onArrivalDateChange(e) {
    this.setData({ arrivalDate: e.detail.value });
  },
  onArrivalDateInput(e) {
    this.setData({ arrivalDate: e.detail.value });
  },

  setFeedInterval(e) {
    const days = e.currentTarget.dataset.days;
    if (days === 'custom') {
      this.setData({ showCustomFeed: true, feedInterval: 0 });
    } else {
      this.setData({ showCustomFeed: false, feedInterval: parseInt(days) });
    }
  },
  onCustomFeedInput(e) {
    this.setData({ customFeedInterval: e.detail.value });
  },

  setSubInterval(e) {
    const days = e.currentTarget.dataset.days;
    if (days === 'custom') {
      this.setData({ showCustomSub: true, subInterval: 0 });
    } else {
      this.setData({ showCustomSub: false, subInterval: parseInt(days) });
    }
  },
  onCustomSubInput(e) {
    this.setData({ customSubInterval: e.detail.value });
  },

  // 提交
  async onSubmit() {
    const { petName, species, feedInterval, subInterval, customFeedInterval, customSubInterval } = this.data;

    if (!petName.trim()) {
      wx.showToast({ title: '请输入宠物昵称', icon: 'none' });
      return;
    }
    if (!species.trim()) {
      wx.showToast({ title: '请输入品种', icon: 'none' });
      return;
    }

    const finalFeedInterval = this.data.showCustomFeed ? parseInt(customFeedInterval) || feedInterval : feedInterval;
    const finalSubInterval  = this.data.showCustomSub  ? parseInt(customSubInterval)  || subInterval  : subInterval;

    if (finalFeedInterval < 1 || finalSubInterval < 1) {
      wx.showToast({ title: '频率至少为 1 天', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      // 头像优先使用上传后返回的 URL，回退到原 avatarUrl
      const avatar = this.uploadedAvatarUrl
        || (this.data.avatarUrl && this.data.avatarUrl.indexOf('http') === 0 ? this.data.avatarUrl : '');

      const petData = {
        name: petName.trim(),
        species: species.trim(),
        arrivalDate: this.data.arrivalDate,
        initialWeight: this.data.initialWeight ? parseFloat(this.data.initialWeight) : 0,
        feed_interval: finalFeedInterval,
        sub_interval: finalSubInterval,
        avatar
        // user_openid 由服务端从 token 注入，不要在客户端传
        // created_at 由服务端默认值生成
        // next_feed_date / next_sub_date 等首次打卡再设置
      };

      if (this.data.isEdit) {
        await api.put('/pets/' + this.data.petId, petData);
      } else {
        await api.post('/pets', petData);
      }

      cache.removeCache('pets');

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
        if (res.confirm) {
          try {
            await api.del('/pets/' + this.data.petId);

            cache.removeCache('pets');
            cache.removeCache('schedule');
            cache.removeCache('weight');
            cache.removeCache('history');

            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (err) {
            console.error('删除失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
