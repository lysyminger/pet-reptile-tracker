// utils/imageCache.js —— 网络图片本地缓存
// 目标：同一张图只从服务器下载一次，之后从本地磁盘读取，再打开不重复拉服务器。
//
// 用法：
//   const imageCache = require('../../utils/imageCache.js');
//   const localPath = await imageCache.ensureLocal(remoteUrl);  // 失败时回退返回原 url
//   this.setData({ src: localPath });
//
// 原理：downloadFile 下载到临时文件 → saveFile 持久化到 USER_DATA_PATH →
//      在 storage 里记录 url→{path,size,ts} 映射；下次命中且文件还在就直接用本地路径。
//      总占用超过 CAP 时按最久未用(LRU)清理。

const fs = wx.getFileSystemManager();
const MAP_KEY = 'img_cache_map_v1';
const CAP_BYTES = 100 * 1024 * 1024; // 本地缓存上限 100MB（小程序总上限 ~200MB）

function loadMap() {
  try { return wx.getStorageSync(MAP_KEY) || {}; } catch (e) { return {}; }
}
function saveMap(map) {
  try { wx.setStorageSync(MAP_KEY, map); } catch (e) {}
}

function fileExists(path) {
  try { fs.accessSync(path); return true; } catch (e) { return false; }
}

// 由 url 推一个稳定的本地文件名（uploads 文件名本身是唯一哈希）
function localPathFor(url) {
  const base = String(url).split('/').pop().split('?')[0] || ('img_' + Date.now());
  return `${wx.env.USER_DATA_PATH}/imgc_${base}`;
}

// 进行中的下载去重，避免同一 url 并发重复下载
const inflight = {};

function ensureLocal(url) {
  if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
    return Promise.resolve(url);
  }

  const map = loadMap();
  const hit = map[url];
  if (hit && hit.path && fileExists(hit.path)) {
    hit.ts = Date.now();            // 更新 LRU 时间
    saveMap(map);
    return Promise.resolve(hit.path);
  }
  if (inflight[url]) return inflight[url];

  const task = new Promise((resolve) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) { resolve(url); return; }
        const filePath = localPathFor(url);
        fs.saveFile({
          tempFilePath: res.tempFilePath,
          filePath,
          success: (s) => {
            const saved = s.savedFilePath || filePath;
            let size = 0;
            try { size = fs.statSync(saved).size; } catch (e) {}
            const m = loadMap();
            m[url] = { path: saved, size, ts: Date.now() };
            saveMap(m);
            enforceCap();
            resolve(saved);
          },
          fail: () => resolve(res.tempFilePath || url) // 存盘失败就用临时文件
        });
      },
      fail: () => resolve(url) // 下载失败回退原 url，<image> 仍能联网加载
    });
  }).then((p) => { delete inflight[url]; return p; });

  inflight[url] = task;
  return task;
}

// 超出上限时按最久未用清理
function enforceCap() {
  const map = loadMap();
  const entries = Object.keys(map).map(k => ({ url: k, ...map[k] }));
  let total = entries.reduce((s, e) => s + (e.size || 0), 0);
  if (total <= CAP_BYTES) return;

  entries.sort((a, b) => (a.ts || 0) - (b.ts || 0)); // 最旧在前
  for (const e of entries) {
    if (total <= CAP_BYTES) break;
    try { fs.unlinkSync(e.path); } catch (err) {}
    total -= (e.size || 0);
    delete map[e.url];
  }
  saveMap(map);
}

// 手动清空（设置页可调用）
function clearAll() {
  const map = loadMap();
  Object.keys(map).forEach(k => { try { fs.unlinkSync(map[k].path); } catch (e) {} });
  saveMap({});
}

module.exports = { ensureLocal, clearAll };
