// app.js
const cache = require('./utils/cache.js');

App({
  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'your-cloud-env-id', // 替换为你的云环境 ID
        traceUser: true
      });
      console.log('云开发初始化完成');
      
      // 输出缓存统计
      const stats = cache.getCacheStats();
      if (Object.keys(stats).length > 0) {
        console.log('缓存状态:', stats);
      }
    }

    // 获取用户 openid（每次启动自动获取）
    this.getOpenid();
  },

  onShow() {
    // 每次小程序从后台回到前台，也确保 openid 存在
    if (!this.globalData.openid) {
      this.getOpenid();
    }
  },

  globalData: {
    openid: null,
    foodTypeOptions: ['杜比亚', '蟋蟀', '乳鼠', '活体', '冰冻', '蔬菜', '水果', '其他'],
    substrateTypeOptions: ['厨房纸', '瓦楞纸', '爬沙', '树皮', '椰土', '其他']
  },

  // 获取用户 openid
  getOpenid() {
    const that = this;
    wx.cloud.callFunction({
      name: 'getOpenid',
      success: res => {
        that.globalData.openid = res.result.openid;
        console.log('获取 openid 成功:', res.result.openid);
        
        // 检查用户信息是否完善
        that.checkUserInfo();
      },
      fail: err => {
        console.error('获取 openid 失败:', err);
      }
    });
  },

  // 检查用户信息是否完善
  async checkUserInfo() {
    if (!wx.cloud || !this.globalData.openid) return;

    try {
      const db = wx.cloud.database();
      const res = await db.collection('user_info').doc(this.globalData.openid).get();
      
      if (!res.data || !res.data.nickname || !res.data.avatarUrl) {
        console.log('用户信息不完善，需要填写');
      }
    } catch (err) {
      console.log('用户信息不存在，需要创建');
    }
  },

  // 退出登录（全局）- 已废弃，不再清空 openid
  // logout() {
  //   this.globalData.openid = null;
  //   console.log('已退出登录，openid 已清空');
  // },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const d = date ? new Date(date) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 计算日期差（天）
  dateDiff(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = d1 - d2;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  // 日期相加（天）
  dateAdd(date, days) {
    // 参数验证：确保 date 有效
    if (!date) {
      console.error('dateAdd: date 参数为空', date);
      return this.formatDate(new Date());
    }
    
    // 参数验证：确保 days 是有效数字
    const daysNum = parseInt(days);
    if (isNaN(daysNum)) {
      console.error('dateAdd: days 参数无效', days);
      return this.formatDate(new Date(date));
    }
    
    const d = new Date(date);
    // 验证日期是否有效
    if (isNaN(d.getTime())) {
      console.error('dateAdd: 日期格式无效', date);
      return this.formatDate(new Date());
    }
    
    d.setDate(d.getDate() + daysNum);
    return this.formatDate(d);
  }
});
