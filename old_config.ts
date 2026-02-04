import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { renderTimeline, getRenderProgress } from './server/render-service.js';
import { transcribeVideo } from './server/transcribe-service.js';
import { generateXML } from './server/xml-service.js';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateSmartCut } from './server/rough-cut-service.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'vite-plugin-render-api',
        configureServer(server) {
          console.log('[Vite] Plugin "vite-plugin-render-api" initialized');
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';
            console.log(`[Vite Middlewares] Incoming request: ${req.method} ${url}`);

            if (url.startsWith('/api/')) {
              console.log(`[DEBUG] API Request: ${req.method} ${url}`);
            }

            if (url.startsWith('/api/render-progress') && req.method === 'GET') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(getRenderProgress()));
              return;
            }

            if (url.startsWith('/api/auto-cut') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { words, asset, trackId } = JSON.parse(body);
                  const clips = generateSmartCut(words, asset, trackId);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, clips }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
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

            if (url.includes('/api/transcribe') && req.method === 'POST') {
              fs.appendFileSync('data/transcribe_log.txt', `[${new Date().toISOString()}] Transcribe hit: ${url}\n`);
              console.log(`[Vite] Transcribe hit!`);
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  fs.appendFileSync('data/transcribe_log.txt', `[${new Date().toISOString()}] Body: ${body}\n`);
                  if (!body) throw new Error('No body received');
                  const { videoPath } = JSON.parse(body);
                  console.log(`[Vite] Transcribing: ${videoPath}`);
                  const transcription = await transcribeVideo(videoPath);
                  fs.appendFileSync('data/transcribe_log.txt', `[${new Date().toISOString()}] SUCCESS for ${videoPath}\n`);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, transcription }));
                } catch (err) {
                  fs.appendFileSync('data/transcribe_log.txt', `[${new Date().toISOString()}] ERROR: ${err.message}\n`);
                  console.error('[API] Transcribe Error:', err.message);
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
                  const data = JSON.parse(body);
                  const exportsDir = path.join(__dirname, 'public', 'exports');
                  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

                  const fileName = `rough_cut_${Date.now()}.xml`;
                  const finalPath = path.join(exportsDir, fileName);

                  await generateXML(data, finalPath);

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

            next();
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
