if (wx.cloud) {
  wx.cloud.init({ traceUser: true })
}

App({
  globalData: {
    prototypeMode: true,
    aiDisclosure: '群成员均为 AI 角色'
  }
})
