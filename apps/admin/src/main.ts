import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { bannerApiKey, createBannerApi } from './api';
import { createAdminClient, webKit } from './runtime';
import './style.css';

createApp(App)
  .provide(bannerApiKey, createBannerApi(createAdminClient()))
  .use(webKit)
  .use(router)
  .mount('#app');
