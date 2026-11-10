import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import { PlayProvider } from './data';
import { registerServiceWorker } from './alerts';
import { isNativeApp, startNativeApp } from './lib/native';
import './styles.css';

if (!isNativeApp) registerServiceWorker();
void startNativeApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlayProvider>
          <App />
        </PlayProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
