import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { renderTimeline, getRenderProgress } from './server/render-service.js';
import { generateXML } from './server/xml-service.js';
import { generateEDL } from './server/edl-service.js';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: {
        overlay: false
      },
      watch: {
        usePolling: true,
        ignored: [
          '**/public/renders/**',
          '**/public/exports/**',
          '**/backend/**',
          '**/data/**',
          '**/*.log',
          '**/*.txt',
          '**/*.py',
          '**/*.pyc',
          '**/.git/**'
        ]
      },
      proxy: {
        '/api': {
          target: env.API_URL || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'vite-plugin-render-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';

            if (url.startsWith('/renders/') && req.method === 'GET') {
              const fileName = url.replace('/renders/', '');
              const filePath = path.join(__dirname, 'public', 'renders', fileName);
              if (fs.existsSync(filePath)) {
                res.writeHead(200, { 'Content-Type': 'video/mp4' });
                fs.createReadStream(filePath).pipe(res);
                return;
              }
            }

            if (url.startsWith('/exports/') && req.method === 'GET') {
              const fileName = url.replace('/exports/', '');
              const filePath = path.join(__dirname, 'public', 'exports', fileName);
              if (fs.existsSync(filePath)) {
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                fs.createReadStream(filePath).pipe(res);
                return;
              }
            }

            if (url.startsWith('/api/render-progress') && req.method === 'GET') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(getRenderProgress()));
              return;
            }

            if (url.startsWith('/api/render') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  if (!body) throw new Error('Empty request body');
                  const data = JSON.parse(body);
                  const rendersDir = path.join(__dirname, 'public', 'renders');
                  if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });

                  const fileName = `render_${Date.now()}.mp4`;
                  const finalPath = path.join(rendersDir, fileName);

                  console.log(`[API] Starting render: ${finalPath}`);
                  renderTimeline(data, finalPath).catch(err => console.error('[API] Render Error:', err));

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, path: `/renders/${fileName}` }));
                } catch (err) {
                  console.error('[API] Render Post-Processing Error:', err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
              return;
            }

            if (url.startsWith('/api/export-xml') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  if (!body) throw new Error('Empty request body');
                  const data = JSON.parse(body);
                  const exportsDir = path.join(__dirname, 'public', 'exports');
                  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

                  const fileName = `rough_cut_${Date.now()}.xml`;
                  const finalPath = path.join(exportsDir, fileName);

                  console.log(`[API] Generating XML (v5): ${finalPath}`);
                  generateXML(data, finalPath);

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, path: `/exports/${fileName}` }));
                } catch (err) {
                  console.error('[API] XML Export Error:', err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
              return;
            }

            if (url.startsWith('/api/export-edl') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  if (!body) throw new Error('Empty request body');
                  const data = JSON.parse(body);
                  const exportsDir = path.join(__dirname, 'public', 'exports');
                  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

                  const fileName = `rough_cut_${Date.now()}.edl`;
                  const finalPath = path.join(exportsDir, fileName);

                  console.log(`[API] Generating EDL: ${finalPath}`);
                  generateEDL(data, finalPath);

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, path: `/exports/${fileName}` }));
                } catch (err) {
                  console.error('[API] EDL Export Error:', err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
              return;
            }

            // Fallthrough to proxy for /api/upload, /api/project, /api/transcribe, etc.
            next();

          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
