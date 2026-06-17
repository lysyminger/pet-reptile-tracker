// app.js
const cache = require('./utils/cache.js');
const api = require('./utils/api.js');

App({
  onLaunch() {
    // 输出缓存统计
    const stats = cache.getCacheStats();
    if (Object.keys(stats).length > 0) {
      console.log('缓存状态:', stats);
    }

    // 走自建后端登录，拿 token + openid
    this.ensureLogin();
  },

  onShow() {
    if (!this.globalData.openid) {
      this.ensureLogin();
    }
  },

  globalData: {
    openid: null,
    foodTypeOptions: ['杜比亚', '蟋蟀', '乳鼠', '活体', '冰冻', '蔬菜', '水果', '其他'],
    substrateTypeOptions: ['厨房纸', '瓦楞纸', '爬沙', '树皮', '椰土', '其他']
  },

  // 确保已登录（有 token + openid）
  async ensureLogin() {
    try {
      // 已有 token 时直接复用本地缓存的 openid
      if (api.getToken()) {
        const cachedOpenid = api.getStoredOpenid();
        if (cachedOpenid) {
          this.globalData.openid = cachedOpenid;
          console.log('使用本地 openid:', cachedOpenid);
          return;
        }
      }
      // 没 token 或没缓存 openid，走 wx.login 流程
      const res = await api.login();
      this.globalData.openid = res.openid;
      console.log('登录成功，openid:', res.openid);
    } catch (err) {
      console.error('登录失败:', err);
    }
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const d = date ? new Date(date) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 取 "YYYY-MM-DD"（或带时间）中的年月日，构造「本地零点」的 Date。
  // 统一用它解析日期，避免 new Date('YYYY-MM-DD') 按 UTC 解析在部分时区差一天。
  // 解析失败返回 null，调用方可自行回退到 new Date()。
  toLocalDay(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  },

  // 计算日期差（天）。两端都按本地零点解析，结果为整数天。
  dateDiff(date1, date2) {
    const d1 = this.toLocalDay(date1) || new Date(date1);
    const d2 = this.toLocalDay(date2) || new Date(date2);
    return Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
  },

  // 日期相加（天）。按本地零点解析，避免时区偏移。
  dateAdd(date, days) {
    if (!date) {
      console.error('dateAdd: date 参数为空', date);
      return this.formatDate(new Date());
    }
    const daysNum = parseInt(days);
    if (isNaN(daysNum)) {
      console.error('dateAdd: days 参数无效', days);
      return this.formatDate(this.toLocalDay(date) || new Date(date));
    }
    const d = this.toLocalDay(date) || new Date(date);
    if (isNaN(d.getTime())) {
      console.error('dateAdd: 日期格式无效', date);
      return this.formatDate(new Date());
    }
    d.setDate(d.getDate() + daysNum);
    return this.formatDate(d);
  }
});
