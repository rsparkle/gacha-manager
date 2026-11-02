import { createApp } from 'vue';
import platform from '#platform';
import './styles/app.css';
import App from './App.vue';
import '@fontsource-variable/nunito';

document.documentElement.dataset.platform = platform.name;

createApp(App).mount('#gachaManagerApp');
