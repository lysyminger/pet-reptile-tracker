// utils/api.js - 自建后端 HTTP 封装
// 部署完阿里云后端后，把 BASE_URL 改成你自己的域名

const BASE_URL = 'https://api.lysyminger.online/api';

const TOKEN_KEY = 'auth_token';
const OPENID_KEY = 'auth_openid';

// ---------- token 工具 ----------
function getToken() {
  try { return wx.getStorageSync(TOKEN_KEY) || ''; } catch (e) { return ''; }
}
function setToken(token) {
  try { wx.setStorageSync(TOKEN_KEY, token || ''); } catch (e) {}
}
function getStoredOpenid() {
  try { return wx.getStorageSync(OPENID_KEY) || ''; } catch (e) { return ''; }
}
function setStoredOpenid(openid) {
  try { wx.setStorageSync(OPENID_KEY, openid || ''); } catch (e) {}
}
function clearAuth() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(OPENID_KEY);
  } catch (e) {}
}

// ---------- 登录：用 wx.login 换 token ----------
let loginPromise = null;
function login() {
  if (loginPromise) return loginPromise;
  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          loginPromise = null;
          reject(new Error('wx.login 未拿到 code'));
          return;
        }
        wx.request({
          url: BASE_URL + '/auth/login',
          method: 'POST',
          data: { code: res.code },
          header: { 'Content-Type': 'application/json' },
          success: (r) => {
            if (r.statusCode === 200 && r.data && r.data.token) {
              setToken(r.data.token);
              setStoredOpenid(r.data.openid);
              const app = getApp();
              if (app && app.globalData) app.globalData.openid = r.data.openid;
              loginPromise = null;
              resolve(r.data);
            } else {
              loginPromise = null;
              reject(new Error('登录失败: ' + (r.data && r.data.error || r.statusCode)));
            }
          },
          fail: (err) => {
            loginPromise = null;
            reject(err);
          }
        });
      },
      fail: (err) => {
        loginPromise = null;
        reject(err);
      }
    });
  });
  return loginPromise;
}

// ---------- 核心请求 ----------
function rawRequest(method, path, data, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) header['Authorization'] = 'Bearer ' + token;

    let url = BASE_URL + path;
    let body = data;

    // GET 请求把 data 拼到 query
    if (method === 'GET' && data && typeof data === 'object') {
      const qs = Object.keys(data)
        .filter(k => data[k] !== undefined && data[k] !== null)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
        .join('&');
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
      body = undefined;
    }

    wx.request({
      url,
      method,
      data: body,
      header,
      success: (res) => {
        if (res.statusCode === 401 && !opts._retried) {
          // token 失效，自动重新登录后重试一次
          clearAuth();
          login()
            .then(() => rawRequest(method, path, data, Object.assign({}, opts, { _retried: true })))
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const msg = (res.data && (res.data.error || res.data.message)) || ('HTTP ' + res.statusCode);
          reject(new Error(msg));
        }
      },
      fail: (err) => reject(err)
    });
  });
}

// ---------- 自动确保 token 存在 ----------
async function ensureAuth() {
  if (getToken()) {
    const app = getApp();
    if (app && app.globalData && !app.globalData.openid) {
      app.globalData.openid = getStoredOpenid();
    }
    return;
  }
  await login();
}

async function request(method, path, data, opts) {
  await ensureAuth();
  return rawRequest(method, path, data, opts);
}

// ---------- 文件上传 ----------
function uploadFile(filePath, fieldName) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureAuth();
      const token = getToken();
      wx.uploadFile({
        url: BASE_URL + '/uploads',
        filePath,
        name: fieldName || 'file',
        header: token ? { 'Authorization': 'Bearer ' + token } : {},
        success: (res) => {
          if (res.statusCode === 401) {
            // 重新登录后再试一次
            clearAuth();
            login()
              .then(() => uploadFile(filePath, fieldName))
              .then(resolve)
              .catch(reject);
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              resolve(data);
            } catch (e) {
              reject(new Error('上传响应解析失败'));
            }
          } else {
            reject(new Error('上传失败: HTTP ' + res.statusCode));
          }
        },
        fail: reject
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  BASE_URL,
  login,
  ensureAuth,
  getToken,
  getStoredOpenid,
  clearAuth,
  uploadFile,
  get:  (path, data, opts) => request('GET',    path, data, opts),
  post: (path, data, opts) => request('POST',   path, data, opts),
  put:  (path, data, opts) => request('PUT',    path, data, opts),
  del:  (path, data, opts) => request('DELETE', path, data, opts)
};
