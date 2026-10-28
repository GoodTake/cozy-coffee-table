import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import App from './App.tsx';
import SiteRainbowKitProvider from './components/SiteRainbowKitProvider';
import { wagmiConfig } from './lib/wagmi';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiteRainbowKitProvider>
          <App />
        </SiteRainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
