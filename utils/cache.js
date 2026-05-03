// utils/cache.js - 数据缓存管理工具

/**
 * 缓存配置（毫秒）
 */
const CACHE_CONFIG = {
  pets: 10 * 60 * 1000,      // 宠物列表 10 分钟
  schedule: 5 * 60 * 1000,   // 日程数据 5 分钟
  weight: 30 * 60 * 1000,    // 体重记录 30 分钟
  history: 15 * 60 * 1000    // 历史记录 15 分钟
};

/**
 * 缓存键前缀
 */
const CACHE_PREFIX = 'cache_';
const CACHE_TIME_PREFIX = 'cache_time_';

/**
 * 获取缓存数据
 * @param {string} type - 缓存类型 (pets, schedule, weight, history)
 * @returns {any|null} 缓存数据，如果失效或不存在则返回 null
 */
function getCache(type) {
  try {
    const cached = wx.getStorageSync(`${CACHE_PREFIX}${type}`);
    const cacheTime = wx.getStorageSync(`${CACHE_TIME_PREFIX}${type}`);
    
    if (!cached || !cacheTime) {
      return null;
    }
    
    const now = Date.now();
    const maxAge = CACHE_CONFIG[type] || 5 * 60 * 1000; // 默认 5 分钟
    
    if (now - cacheTime > maxAge) {
      // 缓存失效，清除
      console.log(`缓存失效: ${type}, 已存在 ${Math.floor((now - cacheTime) / 1000)}s, 最大 ${maxAge / 1000}s`);
      removeCache(type);
      return null;
    }
    
    console.log(`使用缓存：${type}, 剩余 ${Math.floor((maxAge - (now - cacheTime)) / 1000)}s`);
    return cached;
  } catch (err) {
    console.error('读取缓存失败:', err);
    return null;
  }
}

/**
 * 设置缓存数据
 * @param {string} type - 缓存类型
 * @param {any} data - 缓存数据
 */
function setCache(type, data) {
  try {
    wx.setStorageSync(`${CACHE_PREFIX}${type}`, data);
    wx.setStorageSync(`${CACHE_TIME_PREFIX}${type}`, Date.now());
    console.log(`设置缓存：${type}`);
  } catch (err) {
    console.error('设置缓存失败:', err);
  }
}

/**
 * 移除缓存
 * @param {string} type - 缓存类型
 */
function removeCache(type) {
  try {
    wx.removeStorageSync(`${CACHE_PREFIX}${type}`);
    wx.removeStorageSync(`${CACHE_TIME_PREFIX}${type}`);
    console.log(`清除缓存：${type}`);
  } catch (err) {
    console.error('清除缓存失败:', err);
  }
}

/**
 * 清除所有缓存
 */
function clearAllCache() {
  try {
    const keys = wx.getStorageInfoSync().keys;
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIME_PREFIX)) {
        wx.removeStorageSync(key);
      }
    });
    console.log('清除所有缓存');
  } catch (err) {
    console.error('清除所有缓存失败:', err);
  }
}

/**
 * 获取缓存统计信息
 * @returns {Object} 缓存统计
 */
function getCacheStats() {
  try {
    const info = wx.getStorageInfoSync();
    const cacheKeys = info.keys.filter(key => key.startsWith(CACHE_PREFIX));
    const now = Date.now();
    
    const stats = {};
    cacheKeys.forEach(key => {
      const type = key.replace(CACHE_PREFIX, '');
      const cacheTime = wx.getStorageSync(`${CACHE_TIME_PREFIX}${type}`);
      const maxAge = CACHE_CONFIG[type] || 5 * 60 * 1000;
      const age = cacheTime ? now - cacheTime : 0;
      const remaining = maxAge - age;
      
      stats[type] = {
        age: Math.floor(age / 1000),
        remaining: Math.floor(remaining / 1000),
        expired: remaining <= 0
      };
    });
    
    return stats;
  } catch (err) {
    console.error('获取缓存统计失败:', err);
    return {};
  }
}

module.exports = {
  CACHE_CONFIG,
  getCache,
  setCache,
  removeCache,
  clearAllCache,
  getCacheStats
};
