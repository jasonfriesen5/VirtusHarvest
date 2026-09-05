import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './state/AuthProvider';
import { PrefsProvider } from './state/PrefsProvider';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <PrefsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  </StrictMode>,
);
