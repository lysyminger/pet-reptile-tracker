// 云函数：getPhoneNumber
// 用于解密微信手机号

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  try {
    // 获取云调用接口返回的手机号
    const { cloudID } = event;
    
    if (!cloudID) {
      return {
        success: false,
        errMsg: '缺少 cloudID 参数'
      };
    }

    // 使用云开发 SDK 解密手机号
    const res = await cloud.getOpenData({
      list: [cloudID]
    });

    if (res.list && res.list[0]) {
      const phoneData = res.list[0].data;
      return {
        success: true,
        phoneNumber: phoneData.phoneNumber,
        purePhoneNumber: phoneData.purePhoneNumber,
        countryCode: phoneData.countryCode,
        watermark: phoneData.watermark
      };
    }

    return {
      success: false,
      errMsg: '解密失败'
    };
  } catch (err) {
    console.error('获取手机号失败:', err);
    return {
      success: false,
      errMsg: err.message
    };
  }
};
