/** 应用入口：加载数据后再挂载，避免首屏闪空状态 */
import { createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import 'tdesign-vue-next/es/style/index.css';

import App from './App.vue';
import router from './router';
import { store } from './core/store';
import { applyTheme, getTheme } from './core/theme';
import { toast } from './core/toast';
import './styles.css';

applyTheme(getTheme());

const app = createApp(App);
app.use(TDesign);
app.use(router);

void (async () => {
  try {
    await store.init();
  } catch (err) {
    console.error(err);
  }
  app.mount('#app');
  if (store.offline) {
    toast(store.lastError || '无法连接本地服务，请确认「启动工作台.bat」窗口还开着', 'err');
  }
  window.addEventListener('beforeunload', (e) => {
    if (store.pendingCount > 0) {
      void store.flush();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
})();
