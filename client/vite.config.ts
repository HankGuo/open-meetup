import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER_PORT = process.env.PORT || '3001';
const SERVER_ORIGIN = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 开发模式下把 API/上传/Socket 代理到本地服务端，
    // 让开发环境与生产环境（同源部署）行为一致
    proxy: {
      '/api': { target: SERVER_ORIGIN, changeOrigin: true },
      '/uploads': { target: SERVER_ORIGIN, changeOrigin: true },
      '/socket.io': { target: SERVER_ORIGIN, changeOrigin: true, ws: true },
    },
  },
  plugins: [react()],
});
