// pages/pet-gallery/pet-gallery.js —— 宠物相册（选宠物 + 时间轴 + 高清缩放查看）
const app = getApp();
const api = require('../../utils/api.js');
const imageCache = require('../../utils/imageCache.js');

// 把照片列表按「拍摄日期」分组成时间轴
function groupByDate(list) {
  const groups = {};
  const order = [];
  list.forEach(p => {
    const raw = p.taken_at || p.created_at || '';
    const date = String(raw).slice(0, 10) || '未知日期';
    if (!groups[date]) { groups[date] = []; order.push(date); }
    groups[date].push(p);
  });
  return order.map(date => ({
    date,
    label: formatDateLabel(date),
    items: groups[date]
  }));
}

function formatDateLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

Page({
  data: {
    activePetId: '',          // '' = 全部
    petTabs: [],              // [{_id, name, avatar}]，含「全部」
    timeline: [],             // [{date,label,items:[{_id,url,thumb,localThumb,pet_name}]}]
    photoCount: 0,
    today: '',
    loading: true,
    uploading: false,
    // 日期选择浮层
    dateSheetVisible: false,
    dateSheetMode: 'upload',  // 'upload' 先选图后选时间 | 'edit' 改某张照片时间
    dateSheetValue: '',
    dateSheetPhotoId: '',
    pendingFiles: [],
    pendingCount: 0,
    // 查看器
    viewerVisible: false,
    viewerSrc: '',
    viewerLoading: false,
    viewerMenu: true          // 单指时允许微信长按菜单；双指时关闭，避免缩放误触
  },

  onLoad(options) {
    const today = app.formatDate(new Date());
    this.setData({ today, uploadDate: today, activePetId: options.id || '' });
  },

  onShow() {
    // 刷新（相册内容会变，进入时拉一次）
    this.loadPets().then(() => this.loadPhotos());
  },

  async loadPets() {
    try {
      const pets = await api.get('/pets');
      const arr = (Array.isArray(pets) ? pets : []).map(p => ({
        _id: p._id, name: p.name, avatar: p.avatar
      }));
      // 「全部」放最前
      const petTabs = [{ _id: '', name: '全部', avatar: '' }].concat(arr);
      // 若进来时没指定宠物且只有一只，默认选它
      let activePetId = this.data.activePetId;
      if (!activePetId && arr.length === 1) activePetId = arr[0]._id;
      this.setData({ petTabs, activePetId });
    } catch (err) {
      console.error('加载宠物失败:', err);
    }
  },

  onSelectPet(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.activePetId) return;
    this.setData({ activePetId: id });
    this.loadPhotos();
  },

  async loadPhotos() {
    this.setData({ loading: true });
    try {
      const params = this.data.activePetId ? { pet_id: this.data.activePetId } : {};
      const list = await api.get('/pet-photos', params);
      const photos = (Array.isArray(list) ? list : []).map(p => ({
        _id: p._id,
        url: p.url,
        thumb: p.thumb_url || p.url,
        localThumb: p.thumb_url || p.url,
        pet_name: p.pet_name || '',
        taken_at: p.taken_at,
        created_at: p.created_at
      }));
      const timeline = groupByDate(photos);
      this.setData({ timeline, photoCount: photos.length, loading: false });
      this.cacheThumbs();
    } catch (err) {
      console.error('加载相册失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 缩略图换成本地缓存路径（下载一次，之后走磁盘）
  async cacheThumbs() {
    const tl = this.data.timeline;
    await Promise.all(tl.map((g, gi) => Promise.all(g.items.map(async (it, ii) => {
      const local = await imageCache.ensureLocal(it.thumb);
      if (local && local !== it.localThumb) {
        this.setData({ [`timeline[${gi}].items[${ii}].localThumb`]: local });
      }
    }))));
  },

  // 先选图，再弹出日期浮层选择保存到哪一天
  onAddPhoto() {
    if (this.data.uploading) return;
    if (!this.data.activePetId) {
      wx.showToast({ title: '请先在上方选择一只宠物', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!files.length) return;
        this.setData({
          pendingFiles: files,
          pendingCount: files.length,
          dateSheetMode: 'upload',
          dateSheetValue: this.data.today,
          dateSheetVisible: true
        });
      }
    });
  },

  // 长按照片：改时间 / 删除
  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const date = String(e.currentTarget.dataset.date || '').slice(0, 10) || this.data.today;
    wx.showActionSheet({
      itemList: ['修改日期', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.setData({
            dateSheetMode: 'edit',
            dateSheetPhotoId: id,
            dateSheetValue: date,
            dateSheetVisible: true
          });
        } else if (res.tapIndex === 1) {
          this.confirmDelete(id);
        }
      }
    });
  },

  onDateSheetChange(e) {
    this.setData({ dateSheetValue: e.detail.value });
  },
  closeDateSheet() {
    this.setData({ dateSheetVisible: false, pendingFiles: [] });
  },
  async onDateSheetConfirm() {
    const { dateSheetMode, dateSheetValue, dateSheetPhotoId, pendingFiles } = this.data;
    this.setData({ dateSheetVisible: false });
    if (dateSheetMode === 'upload') {
      if (pendingFiles.length) this.uploadAll(pendingFiles, dateSheetValue);
      this.setData({ pendingFiles: [] });
    } else {
      try {
        await api.put('/pet-photos/' + dateSheetPhotoId, { taken_at: dateSheetValue });
        wx.showToast({ title: '已更新日期', icon: 'success' });
        this.loadPhotos();
      } catch (err) {
        console.error('改日期失败:', err);
        wx.showToast({ title: '更新失败', icon: 'none' });
      }
    }
  },

  async uploadAll(files, takenDate) {
    this.setData({ uploading: true });
    wx.showLoading({ title: `上传中 0/${files.length}`, mask: true });
    let done = 0, ok = 0;
    for (const fp of files) {
      try {
        const up = await api.uploadFile(fp, 'file');
        if (up && up.url) {
          await api.post('/pet-photos', {
            pet_id: this.data.activePetId,
            url: up.url,
            thumb_url: up.thumb || up.url,
            taken_at: takenDate || this.data.today
          });
          // 上传即预热本地缓存（缩略图 + 原图），下次显示/查看秒开、不再拉服务器
          imageCache.ensureLocal(up.thumb || up.url);
          if (up.url) imageCache.ensureLocal(up.url);
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

  // 打开高清查看器：先显示占位，再异步换成本地缓存的高清原图
  onOpenViewer(e) {
    const url = e.currentTarget.dataset.url;
    this.setData({ viewerVisible: true, viewerSrc: url, viewerLoading: true });
    imageCache.ensureLocal(url).then(local => {
      this.setData({ viewerSrc: local || url, viewerLoading: false });
    });
  },
  closeViewer() {
    this.setData({ viewerVisible: false, viewerSrc: '', viewerMenu: true });
  },
  noop() {},

  // 双指（缩放）时关掉微信原生长按菜单，只有单指长按才弹
  onViewerTouchStart(e) {
    const multi = e.touches && e.touches.length >= 2;
    if (multi && this.data.viewerMenu) this.setData({ viewerMenu: false });
  },
  onViewerTouchEnd(e) {
    // 所有手指离开后恢复单指长按菜单
    if ((!e.touches || e.touches.length === 0) && !this.data.viewerMenu) {
      this.setData({ viewerMenu: true });
    }
  },

  confirmDelete(id) {
    wx.showModal({
      title: '删除照片', content: '确定删除这张照片吗？', confirmColor: '#E74C3C',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.del('/pet-photos/' + id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadPhotos();
        } catch (err) {
          console.error('删除失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
