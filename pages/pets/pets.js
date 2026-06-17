// pages/pets/pets.js
const app = getApp();
const cache = require('../../utils/cache.js');
const api = require('../../utils/api.js');
const cats = require('../../utils/petCategories.js');

// 到家天数：到家当天记为第 1 天；没填到家日期返回 null
function arrivalDaysOf(arrivalDate) {
  const day = app.toLocalDay(arrivalDate);
  if (!day) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today - day) / (1000 * 60 * 60 * 24)) + 1);
}

Page({
  data: {
    pets: []
  },

  onShow() {
    this.refreshPetsCache();
  },

  // 强制刷新宠物缓存
  async refreshPetsCache() {
    const pets = await this.fetchPetsWithStatus();
    cache.setCache('pets', pets);
    this.setData({ pets });
    return pets;
  },

  // 从后端获取宠物 + 状态
  async fetchPetsWithStatus() {
    try {
      const today = app.formatDate(new Date());

      const pets = await api.get('/pets');
      const petsArr = Array.isArray(pets) ? pets : [];

      const petIds = petsArr.map(p => p._id);

      let weightLogs = [];
      if (petIds.length > 0) {
        weightLogs = await api.get('/weight-logs', {
          pet_ids: petIds.join(','),
          order_by: 'record_date_desc'
        }) || [];
      }

      const weightMap = {};
      weightLogs.forEach(log => {
        if (!weightMap[log.pet_id]) weightMap[log.pet_id] = log.weight;
      });

      return petsArr.map(pet => {
        let feedStatus, feedStatusText, hasFeedSchedule = false;
        if (pet.next_feed_date) {
          hasFeedSchedule = true;
          const nextFeed = pet.next_feed_date;
          if (nextFeed > today) {
            feedStatus = 'upcoming';
            const days = Math.ceil((new Date(nextFeed) - new Date(today)) / (1000 * 60 * 60 * 24));
            feedStatusText = `${days}天后`;
          } else if (nextFeed === today) {
            feedStatus = 'today';
            feedStatusText = '今天';
          } else {
            feedStatus = 'overdue';
            const days = Math.ceil((new Date(today) - new Date(nextFeed)) / (1000 * 60 * 60 * 24));
            feedStatusText = `逾期${days}天`;
          }
        } else {
          feedStatus = 'none';
          feedStatusText = '未设置';
        }

        let subStatus, subStatusText, hasSubSchedule = false;
        if (pet.next_sub_date) {
          hasSubSchedule = true;
          const nextSub = pet.next_sub_date;
          if (nextSub > today) {
            subStatus = 'upcoming';
            const days = Math.ceil((new Date(nextSub) - new Date(today)) / (1000 * 60 * 60 * 24));
            subStatusText = `${days}天后`;
          } else if (nextSub === today) {
            subStatus = 'today';
            subStatusText = '今天';
          } else {
            subStatus = 'overdue';
            const days = Math.ceil((new Date(today) - new Date(nextSub)) / (1000 * 60 * 60 * 24));
            subStatusText = `逾期${days}天`;
          }
        } else {
          subStatus = 'none';
          subStatusText = '未设置';
        }

        const tmpl = cats.getCategory(pet.category);
        return {
          ...pet,
          catLabel: cats.categoryDisplay(pet.category),
          showSub: !!tmpl.modules.substrate,
          subShort: tmpl.subShort || '垫材',
          arrivalDays: arrivalDaysOf(pet.arrivalDate),
          latestWeight: weightMap[pet._id],
          feedStatus,
          feedStatusText,
          subStatus,
          subStatusText,
          hasFeedSchedule,
          hasSubSchedule
        };
      });
    } catch (err) {
      console.error('加载宠物失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      return [];
    }
  },

  onAddPet() {
    wx.navigateTo({ url: '/pages/add-pet/add-pet' });
  },

  onPetTap(e) {
    const petId = e.currentTarget.dataset.petid;
    if (!petId) {
      wx.showToast({ title: '宠物 ID 无效', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/pet-detail/pet-detail?id=${petId}` });
  }
});
