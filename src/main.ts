import { createApp } from 'vue'
import { VueFire, VueFireFirestoreOptionsAPI } from 'vuefire'
import { app } from './firebase'
import App from './App.vue'
import router from './router'

createApp(App)
  .use(VueFire, { firebaseApp: app, modules: [VueFireFirestoreOptionsAPI()] })
  .use(router)
  .mount('#app')
