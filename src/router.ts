import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: App },
    { path: '/swimmer/:name', name: 'swimmer', component: App },
    { path: '/club/:club', name: 'club', component: App },
  ],
})
