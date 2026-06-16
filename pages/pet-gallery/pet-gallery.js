// pages/pet-gallery/pet-gallery.js —— 宠物相册
const app = getApp();
const api = require('../../utils/api.js');
const imageCache = require('../../utils/imageCache.js');

Page({
  data: {
    petId: '',
    photos: [],      // [{ _id, url, thumb, localThumb }]
    loading: true,
    uploading: false
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '缺少宠物 ID', icon: 'none' });
      return;
    }
    this.setData({ petId: options.id });
    this.loadPhotos();
  },

  async loadPhotos() {
    this.setData({ loading: true });
    try {
      const list = await api.get('/pet-photos', { pet_id: this.data.petId });
      const photos = (Array.isArray(list) ? list : []).map(p => ({
        _id: p._id,
        url: p.url,
        thumb: p.thumb_url || p.url,
        localThumb: p.thumb_url || p.url   // 先用网络地址占位，下面换成本地缓存
      }));
      this.setData({ photos, loading: false });
      this.cacheThumbs();
    } catch (err) {
      console.error('加载相册失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 把缩略图逐一换成本地缓存路径（下载一次，之后走本地）
  async cacheThumbs() {
    const photos = this.data.photos;
    await Promise.all(photos.map(async (p, i) => {
      const local = await imageCache.ensureLocal(p.thumb);
      if (local && local !== p.localThumb) {
        this.setData({ [`photos[${i}].localThumb`]: local });
      }
    }));
  },

  // 选图上传（原图、不压缩）
  onAddPhoto() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (files.length) this.uploadAll(files);
      }
    });
  },

  async uploadAll(files) {
    this.setData({ uploading: true });
    wx.showLoading({ title: `上传中 0/${files.length}`, mask: true });
    let done = 0, ok = 0;
    for (const fp of files) {
      try {
        const up = await api.uploadFile(fp, 'file');     // { url, thumb }
        if (up && up.url) {
          await api.post('/pet-photos', {
            pet_id: this.data.petId,
            url: up.url,
            thumb_url: up.thumb || up.url
          });
          ok++;
        }
      } catch (err) {
        console.error('上传失败:', err);
      }
      done++;
      wx.showLoading({ title: `上传中 ${done}/${files.length}`, mask: true });
    }
    wx.hideLoading();
    this.setData({ uploading: false });
    wx.showToast({ title: ok ? '上传成功，审核中' : '上传失败', icon: 'none' });
    if (ok) this.loadPhotos();
  },

  // 点击大图预览（用原图，previewImage 自带缓存）
  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    const urls = this.data.photos.map(p => p.url);
    wx.previewImage({ current: url, urls });
  },

  // 长按删除
  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除照片', content: '确定删除这张照片吗？', confirmColor: '#E74C3C',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.del('/pet-photos/' + id);
          this.setData({ photos: this.data.photos.filter(p => p._id !== id) });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error('删除失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
