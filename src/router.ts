import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: App },
    { path: '/swimmer/:name', name: 'swimmer', component: App },
    { path: '/club/:club', name: 'club', component: App },
    { path: '/gala/:galaId', name: 'gala', component: App },
    { path: '/gala/:galaId/swimmer/:name', name: 'gala-swimmer', component: App },
    { path: '/gala/:galaId/club/:club', name: 'gala-club', component: App },
  ],
})
