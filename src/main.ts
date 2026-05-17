import { createApp } from 'vue'
import { VueFire, VueFireFirestoreOptionsAPI } from 'vuefire'
import { app } from './firebase'
import App from './App.vue'

createApp(App)
  .use(VueFire, { firebaseApp: app, modules: [VueFireFirestoreOptionsAPI()] })
  .mount('#app')
