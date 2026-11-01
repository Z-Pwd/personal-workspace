import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('./views/Dashboard.vue'),
    meta: { title: '仪表盘', sub: '今天要做什么，一眼看清', menu: 'dashboard' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('./views/Projects.vue'),
    meta: { title: '项目管理', sub: '把一件大事拆成能立刻动手的小任务', menu: 'projects' },
  },
  {
    path: '/todos',
    name: 'todos',
    component: () => import('./views/Todos.vue'),
    meta: { title: '今日待办', sub: '优先级 + 四象限，先做重要的事', menu: 'todos' },
  },
  {
    path: '/ideas',
    name: 'ideas',
    component: () => import('./views/Ideas.vue'),
    meta: { title: '灵光一闪', sub: '先记下来，再把它变成行动', menu: 'ideas' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('./views/Reports.vue'),
    meta: { title: '工作汇报', sub: '一键汇总本周 / 本月，生成可编辑的周报月报', menu: 'reports' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/Settings.vue'),
    meta: { title: '设置', sub: '数据目录、备份、外观', menu: 'settings' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
