import { createApp } from 'vue';
import platform from '#platform';
import App from './App.vue';

document.documentElement.dataset.platform = platform.name;

createApp(App).mount('#gachaManagerApp');
