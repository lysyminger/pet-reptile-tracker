// utils/util.js - 工具函数

/**
 * 格式化日期为 YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 格式化日期时间
 */
const formatDateTime = (date) => {
  const d = date ? new Date(date) : new Date();
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 计算两个日期的天数差
 */
const dateDiff = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d1 - d2;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * 日期相加（天）
 */
const dateAdd = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

/**
 * 格式化相对时间
 */
const formatRelativeTime = (date) => {
  const diff = dateDiff(date, new Date());
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1) return `${diff}天后`;
  if (diff < -1) return `${Math.abs(diff)}天前`;
  return formatDate(date);
};

/**
 * 防抖函数
 */
const debounce = (fn, delay = 300) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

/**
 * 节流函数
 */
const throttle = (fn, interval = 300) => {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
};

/**
 * 验证体重输入
 */
const validateWeight = (weight) => {
  const num = parseFloat(weight);
  return !isNaN(num) && num > 0 && num < 100000;
};

/**
 * 显示加载提示
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({ title, mask: true });
};

/**
 * 隐藏加载提示
 */
const hideLoading = () => {
  wx.hideLoading();
};

/**
 * 显示成功提示
 */
const showSuccess = (title = '操作成功') => {
  wx.showToast({ title, icon: 'success' });
};

/**
 * 显示错误提示
 */
const showError = (title = '操作失败') => {
  wx.showToast({ title, icon: 'none' });
};

module.exports = {
  formatDate,
  formatDateTime,
  dateDiff,
  dateAdd,
  formatRelativeTime,
  debounce,
  throttle,
  validateWeight,
  showLoading,
  hideLoading,
  showSuccess,
  showError
};
