// pages/add-pet/add-pet.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');
const cats = require('../../utils/petCategories.js');

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
    customSubInterval: '',
    // 品类（地基）
    category: cats.DEFAULT_CATEGORY,
    categoryIndex: 0,
    categoryOptions: cats.CATEGORY_LIST.map(c => `${c.icon} ${c.label}`),
    showSubstrate: true,
    feedLabel: '喂食',
    subLabel: '垫材更换',
    speciesPlaceholder: '例如：豹纹守宫、玉米蛇'
  },

  onLoad(options) {
    const today = app.formatDate(new Date());
    this.setData({ today });

    if (options.id) {
      this.setData({ petId: options.id, isEdit: true });
      this.loadPetData();
    } else {
      // 新增模式：套用默认品类的模板（标签 / 显隐 / 默认间隔）
      this.applyCategory(cats.DEFAULT_CATEGORY, true);
    }
  },

  // 切换品类
  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const key = cats.CATEGORY_KEYS[idx];
    this.applyCategory(key, true);
  },

  // 套用品类模板。setDefaults=true 时同时重置喂食/垫材间隔为该品类默认值
  applyCategory(key, setDefaults) {
    const tmpl = cats.getCategory(key);
    const idx = Math.max(0, cats.CATEGORY_KEYS.indexOf(key));
    const patch = {
      category: cats.CATEGORY_KEYS[idx] || cats.DEFAULT_CATEGORY,
      categoryIndex: idx,
      showSubstrate: !!tmpl.modules.substrate,
      feedLabel: tmpl.feedLabel || '喂食频率',
      subLabel: tmpl.subLabel || '更换频率',
      speciesPlaceholder: tmpl.speciesPlaceholder || '它是什么呢'
    };
    if (setDefaults) {
      patch.feedInterval = tmpl.feedDefault;
      patch.subInterval = tmpl.subDefault;
      patch.showCustomFeed = false;
      patch.showCustomSub = false;
      patch.customFeedInterval = '';
      patch.customSubInterval = '';
    }
    this.setData(patch);
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
      // 套用该宠物的品类模板（标签/显隐），但保留它已保存的间隔
      this.applyCategory(pet.category || cats.DEFAULT_CATEGORY, false);
    } catch (err) {
      console.error('加载宠物数据失败:', err);
    }
  },

  // 选择头像 → 进入裁剪页 → 回传裁剪结果后上传
  chooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.navigateTo({
          url: '/pages/avatar-cropper/avatar-cropper?src=' + encodeURIComponent(tempFilePath),
          events: {
            // 裁剪页确定后回传圆形头像本地路径
            cropped: (data) => {
              if (data && data.path) {
                this.setData({ avatarUrl: data.path });
                this.uploadAvatar(data.path);
              }
            }
          }
        });
      }
    });
  },

  // ============================================================
  // 【内容安全说明 · 供审核参考】
  // 头像（用户可自定义上传的 UGC 图片）已接入微信「内容安全」能力：
  //   1. 图片上传到自建后端后，后端立即调用微信 media_check_async
  //      （/wxa/media_check_async，图片异步检测，必须服务端调用）；
  //   2. 微信将检测结果异步推送到后端回调，若判定为违规（risky），
  //      后端会自动清除该头像并删除文件，违规图片不会在小程序内继续展示；
  //   3. 上传后向用户提示“审核中”，告知所发布内容需经安全检测。
  // 文本类 UGC（昵称等）同样可经 msg_sec_check 检测（后端已具备能力）。
  // ============================================================
  async uploadAvatar(filePath) {
    try {
      const res = await api.uploadFile(filePath, 'file');
      if (res && res.url) {
        this.uploadedAvatarUrl = res.url;
        this.setData({ avatarUrl: res.url });
        // 头像会经微信内容安全异步审核，若含违规内容稍后会被自动移除
        wx.showToast({ title: '上传成功，审核中', icon: 'none' });
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

    if (finalFeedInterval < 1) {
      wx.showToast({ title: '喂食频率至少为 1 天', icon: 'none' });
      return;
    }
    // 该品类没有「垫材/清洁」模块时不校验、也不送 sub_interval（不安排该日程）
    if (this.data.showSubstrate && finalSubInterval < 1) {
      wx.showToast({ title: '更换频率至少为 1 天', icon: 'none' });
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
        category: this.data.category,
        arrivalDate: this.data.arrivalDate,
        initialWeight: this.data.initialWeight ? parseFloat(this.data.initialWeight) : 0,
        feed_interval: finalFeedInterval,
        sub_interval: this.data.showSubstrate ? finalSubInterval : null,
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
