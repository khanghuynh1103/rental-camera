import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import viVN from 'antd/locale/vi_VN';
import App from './App';
import './styles/base.css';
import './styles/interaction.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#ad4e2b',
          colorLink: '#ad4e2b',
          colorLinkHover: '#84391f',
          colorLinkActive: '#84391f',
          colorInfo: '#ad4e2b',
          colorText: '#2d211b',
          colorBgContainer: '#fffaf2',
          colorBorder: '#d8cbbb',
          borderRadius: 12,
          fontFamily: '"DM Sans", sans-serif'
        },
        components: {
          Button: { borderRadius: 999, controlHeight: 42 },
          Input: { controlHeight: 42 },
          Select: { controlHeight: 42 }
        }
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>
);
