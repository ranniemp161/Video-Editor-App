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
  const env = loadEnv(mode, process.cwd(), '');

  console.log('*****************************************');
  console.log(`[Vite] LOADING MODE: ${mode}`);
  console.log(`[Vite] VITE_API_URL: ${env.VITE_API_URL || '(not set)'}`);
  console.log('*****************************************');

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
      // No proxy needed — frontend talks directly to backend via VITE_API_URL
      // CORS on the backend handles cross-origin requests
    },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'vite-plugin-render-api',
        configureServer(server) {

          // Serve rendered video files
          server.middlewares.use('/renders', (req, res, next) => {
            if (req.method !== 'GET') return next();
            const fileName = path.basename(req.url || '');
            const filePath = path.join(__dirname, 'public', 'renders', fileName);
            const rendersDir = path.resolve(__dirname, 'public', 'renders');
            if (!path.resolve(filePath).startsWith(rendersDir) || !fs.existsSync(filePath)) return next();
            res.writeHead(200, { 'Content-Type': 'video/mp4' });
            fs.createReadStream(filePath).pipe(res);
          });

          // Serve exported XML/EDL files
          server.middlewares.use('/exports', (req, res, next) => {
            if (req.method !== 'GET') return next();
            const fileName = path.basename(req.url || '');
            const filePath = path.join(__dirname, 'public', 'exports', fileName);
            const exportsDir = path.resolve(__dirname, 'public', 'exports');
            if (!path.resolve(filePath).startsWith(exportsDir) || !fs.existsSync(filePath)) return next();
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            fs.createReadStream(filePath).pipe(res);
          });

          // Render progress (GET)
          server.middlewares.use('/api/render-progress', (req, res, next) => {
            if (req.method !== 'GET') return next();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(getRenderProgress()));
          });

          // Render timeline (POST)
          server.middlewares.use('/api/render', (req, res, next) => {
            if (req.method !== 'POST') return next();
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
              } catch (err: any) {
                console.error('[API] Render Post-Processing Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          });

          // Export XML (POST)
          server.middlewares.use('/api/export-xml', (req, res, next) => {
            if (req.method !== 'POST') return next();
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
              } catch (err: any) {
                console.error('[API] XML Export Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          });

          // Export EDL (POST)
          server.middlewares.use('/api/export-edl', (req, res, next) => {
            if (req.method !== 'POST') return next();
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
              } catch (err: any) {
                console.error('[API] EDL Export Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
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
