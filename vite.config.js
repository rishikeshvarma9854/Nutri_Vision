import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
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
    'https://nutri-vision.onrender.com',
    'https://nutri-vision-app-gqepd5e8cyc8hgez.southeastasia-01.azurewebsites.net'
  ]
  
  // Add all local IPs with port 3000
  localIPs.forEach(ip => {
    origins.push(`http://${ip}:3000`)
  })
  
  return origins
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'NutriVision',
        short_name: 'NutriVision',
        description: 'Nutrition Chatbot with Gemini AI',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: {
      origin: generateOrigins(),
      credentials: true
    }
  },
  preview: {
    port: 3000,
    strictPort: true,
    cors: {
      origin: generateOrigins(),
      credentials: true
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore']
        }
      }
    }
  }
}) 