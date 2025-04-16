import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { networkInterfaces } from 'os'

// Get all non-internal IPv4 addresses
const getLocalIPs = () => {
  const interfaces = networkInterfaces()
  const ips = []
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  
  return ips.length > 0 ? ips : ['localhost']
}

const localIPs = getLocalIPs()

// Generate all possible origins
const generateOrigins = () => {
  const origins = [
    'https://nutri-vision-704d5.web.app',
    'https://nutri-vision-704d5.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5000'
  ]
  
  // Add all local IPs with both ports
  localIPs.forEach(ip => {
    origins.push(`http://${ip}:3000`)
    origins.push(`http://${ip}:5000`)
  })
  
  return origins
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    https: false,
    proxy: {
      '/detect': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        ws: true,
        configure: (proxy, options) => {
          // Get the host from the request
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const host = req.headers.host;
            if (host && !host.includes('localhost')) {
              // If accessing through IP, update the target to use the same IP
              const ip = host.split(':')[0];
              proxyReq.setHeader('host', `${ip}:5000`);
              options.target = `http://${ip}:5000`;
            }
          });
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong. Please try again later.');
          });
        }
      },
      '/get_nutrition': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const host = req.headers.host;
            if (host && !host.includes('localhost')) {
              const ip = host.split(':')[0];
              proxyReq.setHeader('host', `${ip}:5000`);
              options.target = `http://${ip}:5000`;
            }
          });
        }
      },
      '/classify_meal': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const host = req.headers.host;
            if (host && !host.includes('localhost')) {
              const ip = host.split(':')[0];
              proxyReq.setHeader('host', `${ip}:5000`);
              options.target = `http://${ip}:5000`;
            }
          });
        }
      },
      '/health': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const host = req.headers.host;
            if (host && !host.includes('localhost')) {
              const ip = host.split(':')[0];
              proxyReq.setHeader('host', `${ip}:5000`);
              options.target = `http://${ip}:5000`;
            }
          });
        }
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const host = req.headers.host;
            if (host && !host.includes('localhost')) {
              const ip = host.split(':')[0];
              proxyReq.setHeader('host', `${ip}:5000`);
              options.target = `http://${ip}:5000`;
            }
          });
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong. Please try again later.');
          });
        }
      }
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    },
    fs: {
      strict: true,
      allow: ['src']
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  optimizeDeps: {
    include: [
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled'
    ],
    exclude: [],
    force: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: '/',
  publicDir: 'public',
  cors: {
    origin: generateOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
  }
}) 