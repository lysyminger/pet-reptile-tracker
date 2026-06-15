// utils/whatsNew.js - 版本更新提示
// 每次发版：把 CURRENT_VERSION 改成新版本号，并在 NOTES 里加上对应的更新内容。
// 用户每个版本只会看到一次弹窗，点「知道了」后记住；下次升版本号会再弹一次。

const CURRENT_VERSION = '2.2.0';

// 各版本的更新说明（key 必须是版本号字符串）
const NOTES = {
  '2.2.0': [
    '🖼️ 上传头像支持圆形裁剪，可拖动缩放自由选取',
    '✨ 「我的」页支持点击昵称修改，实时同步到云端',
    '🐾 体验细节优化',
  ],
  '2.1.0': [
    '✨ 「我的」页支持点击昵称修改，实时同步到云端',
    '🐾 体验细节优化',
  ],
};

const SEEN_KEY = 'whats_new_seen_version';

// 进程内标记，避免同一次启动里重复弹（tab 来回切换时）
let shownThisSession = false;

function maybeShow() {
  if (shownThisSession) return;

  let seen = '';
  try { seen = wx.getStorageSync(SEEN_KEY) || ''; } catch (e) {}
  if (seen === CURRENT_VERSION) return; // 当前版本已经看过

  const notes = NOTES[CURRENT_VERSION];
  if (!notes || notes.length === 0) return; // 没配更新内容就不弹

  shownThisSession = true;
  wx.showModal({
    title: `更新啦 · v${CURRENT_VERSION}`,
    content: notes.join('\n'),
    showCancel: false,
    confirmText: '知道了',
    success: () => {
      // 用户点掉后记住，之后这个版本不再弹
      try { wx.setStorageSync(SEEN_KEY, CURRENT_VERSION); } catch (e) {}
    },
  });
}

module.exports = { maybeShow, CURRENT_VERSION };
