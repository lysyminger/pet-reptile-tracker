// pages/mine/mine.js
const app = getApp();
const api = require('../../utils/api.js');

// 取 "YYYY-MM-DD" 或 "YYYY-MM-DD HH:MM:SS" 中的年月日，构造本地零点（避免时区差一天）
function toLocalDay(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

Page({
  data: {
    userInfo: {},
    openid: '',
    hasUserInfo: false,
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
    this.setData({ openid: openid || '未登录' });

    if (openid) {
      await this.loadUserInfoFromServer();
      await this.loadStats();
    }
  },

  // 从后端加载用户信息
  async loadUserInfoFromServer() {
    try {
      const user = await api.get('/user');
      if (user && user.nickname) {
        this.setData({
          userInfo: user,
          hasUserInfo: true
        });
      } else {
        // 后端还没有该用户记录，自动创建一个默认昵称
        await this.autoSaveUserInfo();
      }
    } catch (err) {
      console.error('用户信息加载失败:', err);
    }
  },

  // 自动保存用户信息
  async autoSaveUserInfo() {
    try {
      const userData = { nickname: '爬宠爱好者' };
      const saved = await api.post('/user', userData);
      this.setData({
        userInfo: saved || userData,
        hasUserInfo: true
      });
    } catch (err) {
      console.error('自动保存用户信息失败:', err);
    }
  },

  // 点击昵称 → 弹出输入框修改
  onEditNickname() {
    if (!app.globalData.openid) {
      wx.showToast({ title: '登录信息丢失，请重试', icon: 'none' });
      return;
    }
    const current = this.data.userInfo.nickname || '';
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新昵称',
      content: current,
      success: (res) => {
        if (!res.confirm) return;
        const nickname = (res.content || '').trim();
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' });
          return;
        }
        if (nickname.length > 20) {
          wx.showToast({ title: '昵称最多 20 个字', icon: 'none' });
          return;
        }
        if (nickname === current) return; // 没改，跳过请求
        this.saveNickname(nickname);
      }
    });
  },

  // 同步昵称到后端
  async saveNickname(nickname) {
    wx.showLoading({ title: '保存中...' });
    try {
      const saved = await api.post('/user', { nickname });
      this.setData({
        userInfo: saved || Object.assign({}, this.data.userInfo, { nickname }),
        hasUserInfo: true
      });
      wx.hideLoading();
      wx.showToast({ title: '修改成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('修改昵称失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 加载统计数据
  async loadStats() {
    try {
      const pets = await api.get('/pets');
      const petsArr = Array.isArray(pets) ? pets : [];
      const petIds = petsArr.map(p => p._id);

      let feedCount = 0;
      let currentWeight = 0;

      if (petIds.length > 0) {
        const petIdsStr = petIds.join(',');
        const [feedRes, weightRes] = await Promise.all([
          api.get('/feed-logs/count', { pet_ids: petIdsStr }),
          api.get('/weight-logs',     { pet_ids: petIdsStr, order_by: 'record_date_desc', limit: 1 })
        ]);
        feedCount = (feedRes && feedRes.count) || 0;
        if (Array.isArray(weightRes) && weightRes.length > 0) {
          currentWeight = weightRes[0].weight || 0;
        }
      }

      // 养宠天数：从最早的「到家日期」算到今天（到家当天记为第 1 天）
      // 某只宠物没填到家日期则回退用它的 created_at
      let daysCount = 0;
      if (petsArr.length > 0) {
        const days = petsArr
          .map(p => toLocalDay(p.arrivalDate) || toLocalDay(p.created_at))
          .filter(Boolean);
        if (days.length > 0) {
          const earliest = days.reduce((a, b) => (a < b ? a : b));
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          daysCount = Math.max(0, Math.round((today - earliest) / (1000 * 60 * 60 * 24)) + 1);
        }
      }

      this.setData({
        stats: {
          petsCount: petsArr.length,
          feedCount,
          currentWeight,
          daysCount
        }
      });
    } catch (err) {
      console.error('加载统计失败:', err);
      this.setData({
        stats: { petsCount: 0, feedCount: 0, currentWeight: 0, daysCount: 0 }
      });
    }
  },

  // 导出数据（改为复制到剪贴板）
  onExportData() {
    wx.showModal({
      title: '导出数据',
      content: '将所有宠物和记录数据复制到剪贴板（JSON 格式）',
      success: (res) => {
        if (res.confirm) this.exportData();
      }
    });
  },

  async exportData() {
    wx.showLoading({ title: '导出中...' });
    try {
      const pets = await api.get('/pets');
      const petsArr = Array.isArray(pets) ? pets : [];
      const petIds = petsArr.map(p => p._id);

      let feedLogs = [], weightLogs = [], subLogs = [];
      if (petIds.length > 0) {
        const petIdsStr = petIds.join(',');
        [feedLogs, weightLogs, subLogs] = await Promise.all([
          api.get('/feed-logs',      { pet_ids: petIdsStr }),
          api.get('/weight-logs',    { pet_ids: petIdsStr }),
          api.get('/substrate-logs', { pet_ids: petIdsStr })
        ]);
      }

      const exportData = {
        exportTime: new Date().toISOString(),
        pets: petsArr,
        feedLogs: feedLogs || [],
        weightLogs: weightLogs || [],
        substrateLogs: subLogs || []
      };

      wx.setClipboardData({
        data: JSON.stringify(exportData, null, 2),
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '导出失败', icon: 'none' });
        }
      });
    } catch (err) {
      wx.hideLoading();
      console.error('导出失败:', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // 数据备份
  onBackup() {
    wx.showToast({ title: '数据已同步到服务器', icon: 'success' });
  },

  // 常见问题
  onFAQ() {
    wx.showModal({
      title: '常见问题',
      content: 'Q: 如何添加宠物？\nA: 点击底部"爱宠"Tab，然后点击"添加新宠物"\n\nQ: 如何喂食打卡？\nA: 首页会显示待办事项，点击"打卡"即可\n\nQ: 数据会丢失吗？\nA: 所有数据都保存在云端服务器，不会丢失',
      showCancel: false
    });
  },

  // 关于我们
  onAbout() {
    wx.showModal({
      title: '关于爬宠饲养记',
      content: 'Version 2.3.0\n\n专为异宠玩家设计的轻量级饲养记录工具。\n\n核心价值：\n• 动态顺延日程\n• 体重成长可视化\n• 成长相册记录\n• 科学饲养反馈',
      showCancel: false
    });
  }
});
