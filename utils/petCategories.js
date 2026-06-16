// utils/petCategories.js —— 宠物品类模板
// 「地基」：每个品类决定显示哪些护理模块、默认间隔、推荐物种、图标与文案。
// 以后扩品类或加护理模块（蜕皮/驱虫…），只改这一个文件即可。
//
// 关于 substrate 模块：它复用现有后端的 sub_interval / next_sub_date / substrate_logs，
// 表示「第二项周期护理」。不同品类语义不同——爬虫=垫材更换、两栖=换水、小宠=笼舍清洁。
// 没有这项的品类（昆虫节肢/猫狗）modules.substrate=false，表单与详情自动隐藏该模块。
//
// 文案字段：
//   feedLabel  喂食模块名（"喂食"）——表单显示 "{feedLabel}频率 (天)"
//   subLabel   第二护理模块全名（"垫材更换"/"换水"/"笼舍清洁"）
//   subShort   第二护理简称（"垫材"/"换水"/"笼舍"）——用于列表小标签
//
// modules 其它开关（molt/climate/rehouse/deworm/vaccine）为后续迭代预留，暂未接打卡。

const CATEGORIES = {
  reptile: {
    label: '爬行动物', icon: '🦎',
    species: ['豹纹守宫', '玉米蛇', '球蟒', '鬃狮蜥', '王者蜥', '陆龟', '其他'],
    modules: { feed: true, weight: true, substrate: true, molt: true, climate: true },
    feedDefault: 3, subDefault: 15,
    feedLabel: '喂食', subLabel: '垫材更换', subShort: '垫材',
    speciesPlaceholder: '例如：豹纹守宫、玉米蛇',
  },
  invert: {
    label: '昆虫/节肢', icon: '🕷️',
    species: ['捕鸟蛛', '帝王蝎', '螳螂', '甲虫', '马陆', '其他'],
    modules: { feed: true, weight: true, substrate: false, molt: true, rehouse: true, climate: true },
    feedDefault: 7, subDefault: 0,
    feedLabel: '喂食', subLabel: '', subShort: '',
    speciesPlaceholder: '例如：捕鸟蛛、帝王蝎',
  },
  amphibian: {
    label: '两栖动物', icon: '🐸',
    species: ['角蛙', '蝾螈', '树蛙', '钟角蛙', '其他'],
    modules: { feed: true, weight: true, substrate: true, climate: true },
    feedDefault: 2, subDefault: 3,
    feedLabel: '喂食', subLabel: '换水', subShort: '换水',
    speciesPlaceholder: '例如：角蛙、蝾螈',
  },
  smallpet: {
    label: '小宠', icon: '🐹',
    species: ['仓鼠', '兔子', '龙猫', '刺猬', '荷兰猪', '其他'],
    modules: { feed: true, weight: true, substrate: true },
    feedDefault: 1, subDefault: 7,
    feedLabel: '喂食', subLabel: '笼舍清洁', subShort: '笼舍',
    speciesPlaceholder: '例如：仓鼠、兔子',
  },
  catdog: {
    label: '猫狗', icon: '🐱',
    species: ['猫', '狗', '其他'],
    modules: { feed: true, weight: true, substrate: false, deworm: true, vaccine: true },
    feedDefault: 1, subDefault: 0,
    feedLabel: '喂食', subLabel: '', subShort: '',
    speciesPlaceholder: '例如：英短、柯基',
  },
  other: {
    label: '其他', icon: '🐾',
    species: ['其他'],
    modules: { feed: true, weight: true, substrate: true },
    feedDefault: 3, subDefault: 15,
    feedLabel: '喂食', subLabel: '清洁更换', subShort: '清洁',
    speciesPlaceholder: '它是什么呢',
  },
};

// 默认品类（兼容老数据：迁移前的宠物没有 category，按爬虫处理）
const DEFAULT_CATEGORY = 'reptile';

// 给 picker 用的有序列表
const CATEGORY_KEYS = ['reptile', 'invert', 'amphibian', 'smallpet', 'catdog', 'other'];
const CATEGORY_LIST = CATEGORY_KEYS.map(key => ({ key, ...CATEGORIES[key] }));

// 取某个品类的模板，未知/空回退到默认
function getCategory(key) {
  return CATEGORIES[key] || CATEGORIES[DEFAULT_CATEGORY];
}

// 取展示用的「图标 + 名称」，如 "🦎 爬行动物"
function categoryDisplay(key) {
  const c = getCategory(key);
  return `${c.icon} ${c.label}`;
}

module.exports = {
  CATEGORIES,
  CATEGORY_KEYS,
  CATEGORY_LIST,
  DEFAULT_CATEGORY,
  getCategory,
  categoryDisplay,
};
