import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_REASON } from './utils/sessionEvents'

window.addEventListener(SESSION_EXPIRED_EVENT, () => {
  const current = router.currentRoute.value
  if (current.meta?.public) {
    return
  }
  router.push({
    path: '/login',
    query: {
      redirect: current.fullPath,
      reason: SESSION_EXPIRED_REASON,
    },
  })
})

createApp(App)
  .use(pinia)
  .use(router)
  .use(ElementPlus, { locale: zhCn })
  .mount('#app')
