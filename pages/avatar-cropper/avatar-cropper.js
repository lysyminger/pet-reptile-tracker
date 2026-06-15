// pages/avatar-cropper/avatar-cropper.js
// 圆形头像裁剪：Canvas 2D 绘制 + 自处理单指拖动 / 双指缩放，
// 确定后把裁剪圆内的区域导出为圆形 PNG，通过 eventChannel 回传给上一页。

function distOf(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

Page({
  data: {
    stageW: 300,   // 编辑区宽（px）
    stageH: 300,   // 编辑区高（px）
    cropD: 222,    // 裁剪圆直径（px）
    cropLeft: 0,
    cropTop: 0,
    outSize: 300   // 输出图边长（css px），实际像素再乘 dpr
  },

  onLoad(options) {
    this.src = options.src ? decodeURIComponent(options.src) : '';
    if (!this.src) {
      wx.showToast({ title: '没有选择图片', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const sys = wx.getSystemInfoSync();
    const dpr = sys.pixelRatio || 2;
    const stageW = sys.windowWidth;
    const stageH = stageW;            // 正方形编辑区
    const cropD = Math.round(stageW * 0.74);

    this.dpr = dpr;
    this.setData({
      stageW,
      stageH,
      cropD,
      cropLeft: Math.round((stageW - cropD) / 2),
      cropTop: Math.round((stageH - cropD) / 2)
    });
  },

  onReady() {
    if (!this.src) return;
    this.initCanvas();
  },

  // 初始化编辑画布与输出画布，加载图片
  initCanvas() {
    const q = wx.createSelectorQuery();
    q.select('#editCanvas').fields({ node: true });
    q.select('#editCanvas').boundingClientRect();
    q.select('#outCanvas').fields({ node: true });
    q.exec((res) => {
      const editCanvas = res[0] && res[0].node;
      const rect = res[1];
      const outCanvas = res[2] && res[2].node;
      if (!editCanvas || !outCanvas) {
        wx.showToast({ title: '画布初始化失败', icon: 'none' });
        return;
      }

      const { stageW, stageH, outSize } = this.data;
      const dpr = this.dpr;

      // 记录编辑区在视口中的位置（双指缩放算中点用）
      this.stageLeft = rect ? rect.left : 0;
      this.stageTop = rect ? rect.top : 0;

      // 编辑画布
      const ctx = editCanvas.getContext('2d');
      editCanvas.width = stageW * dpr;
      editCanvas.height = stageH * dpr;
      ctx.scale(dpr, dpr);
      this.editCanvas = editCanvas;
      this.ctx = ctx;

      // 输出画布
      const octx = outCanvas.getContext('2d');
      outCanvas.width = outSize * dpr;
      outCanvas.height = outSize * dpr;
      octx.scale(dpr, dpr);
      this.outCanvas = outCanvas;
      this.octx = octx;

      // 加载图片
      const img = editCanvas.createImage();
      img.onload = () => {
        this.img = img;
        this.imgW = img.width;
        this.imgH = img.height;
        this.initTransform();
        this.draw();
      };
      img.onerror = () => {
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      };
      img.src = this.src;
    });
  },

  // 初始变换：缩放到刚好覆盖裁剪圆，并居中
  initTransform() {
    const { cropD, stageW, stageH } = this.data;
    this.minK = Math.max(cropD / this.imgW, cropD / this.imgH);
    this.maxK = this.minK * 4;
    this.k = this.minK;

    const cx = stageW / 2;
    const cy = stageH / 2;
    this.ox = cx - (this.imgW * this.k) / 2;
    this.oy = cy - (this.imgH * this.k) / 2;
    this.clamp();
  },

  // 约束偏移，保证裁剪圆始终落在图片内（圆内不出现空白）
  clamp() {
    const { cropD, stageW, stageH } = this.data;
    const R = cropD / 2;
    const cx = stageW / 2;
    const cy = stageH / 2;

    const minOx = cx + R - this.imgW * this.k;
    const maxOx = cx - R;
    this.ox = Math.min(maxOx, Math.max(minOx, this.ox));

    const minOy = cy + R - this.imgH * this.k;
    const maxOy = cy - R;
    this.oy = Math.min(maxOy, Math.max(minOy, this.oy));
  },

  draw() {
    if (!this.ctx || !this.img) return;
    const { stageW, stageH } = this.data;
    this.ctx.clearRect(0, 0, stageW, stageH);
    this.ctx.drawImage(this.img, this.ox, this.oy, this.imgW * this.k, this.imgH * this.k);
  },

  onTouchStart(e) {
    if (e.touches.length >= 2) {
      this.mode = 'zoom';
      this.lastDist = distOf(e.touches);
    } else if (e.touches.length === 1) {
      this.mode = 'pan';
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  },

  onTouchMove(e) {
    if (!this.img) return;

    if (this.mode === 'zoom' && e.touches.length >= 2) {
      const newDist = distOf(e.touches);
      if (this.lastDist > 0) {
        let f = newDist / this.lastDist;
        let newK = Math.min(this.maxK, Math.max(this.minK, this.k * f));
        const ef = newK / this.k; // 实际生效的缩放系数（夹紧后）

        // 以双指中点为锚点缩放
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.stageLeft;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.stageTop;
        this.ox = mx - (mx - this.ox) * ef;
        this.oy = my - (my - this.oy) * ef;
        this.k = newK;

        this.clamp();
        this.draw();
      }
      this.lastDist = newDist;
    } else if (this.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      this.ox += t.clientX - this.lastX;
      this.oy += t.clientY - this.lastY;
      this.lastX = t.clientX;
      this.lastY = t.clientY;
      this.clamp();
      this.draw();
    }
  },

  onTouchEnd(e) {
    // 抬起一根手指后从缩放平滑切回拖动，避免跳变
    if (e.touches && e.touches.length === 1) {
      this.mode = 'pan';
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    } else {
      this.mode = null;
    }
  },

  onCancel() {
    wx.navigateBack();
  },

  onConfirm() {
    if (!this.img || !this.octx) {
      wx.showToast({ title: '请稍候', icon: 'none' });
      return;
    }
    const { cropD, stageW, stageH, outSize } = this.data;
    const R = cropD / 2;
    const cx = stageW / 2;
    const cy = stageH / 2;

    // 裁剪圆外接矩形在画布坐标 → 反算到原图像素
    const sx = (cx - R - this.ox) / this.k;
    const sy = (cy - R - this.oy) / this.k;
    const sw = cropD / this.k;
    const sh = cropD / this.k;

    // 圆形裁剪绘制到输出画布
    const octx = this.octx;
    octx.clearRect(0, 0, outSize, outSize);
    octx.save();
    octx.beginPath();
    octx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    octx.clip();
    octx.drawImage(this.img, sx, sy, sw, sh, 0, 0, outSize, outSize);
    octx.restore();

    wx.showLoading({ title: '处理中...' });
    wx.canvasToTempFilePath({
      canvas: this.outCanvas,
      x: 0,
      y: 0,
      width: outSize,
      height: outSize,
      destWidth: outSize * this.dpr,
      destHeight: outSize * this.dpr,
      fileType: 'png', // 保留圆形透明边角
      success: (res) => {
        wx.hideLoading();
        this.emitResult(res.tempFilePath);
        wx.navigateBack();
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('裁剪导出失败:', err);
        wx.showToast({ title: '裁剪失败', icon: 'none' });
      }
    });
  },

  // 把裁剪结果回传给打开本页的页面
  emitResult(path) {
    try {
      const ec = this.getOpenerEventChannel();
      if (ec && ec.emit) ec.emit('cropped', { path });
    } catch (e) {
      console.error('回传裁剪结果失败:', e);
    }
  }
});
