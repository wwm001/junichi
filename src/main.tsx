import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/main.css';

let updateServiceWorker:
  | ((reloadPage?: boolean | undefined) => Promise<void>)
  | undefined;

updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    const runUpdate = updateServiceWorker;

    if (runUpdate) {
      void runUpdate(true).finally(() => {
        window.location.reload();
      });
      return;
    }

    window.location.reload();
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    window.setInterval(() => {
      void registration.update();
    }, 60_000);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
