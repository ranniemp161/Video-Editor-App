import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { renderTimeline, getRenderProgress } from './render-service.js';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
          server.middlewares.use(async (req, res, next) => {
            const url = req.url || '';

            if (url.startsWith('/api/')) {
              console.log(`[DEBUG] API Request: ${req.method} ${url}`);
            }

            if (url.startsWith('/api/render-progress') && req.method === 'GET') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(getRenderProgress()));
              return;
            }

            if (url.startsWith('/api/render') && req.method === 'POST') {
              console.log('[DEBUG] Rendering POST Request matching start');
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  console.log('[DEBUG] Body received, length:', body.length);
                  if (!body) throw new Error('Empty request body');

                  const data = JSON.parse(body);
                  const downloadsDir = path.join(os.homedir(), 'Downloads');
                  const timestamp = Date.now();
                  const finalPath = path.join(downloadsDir, `render_${timestamp}.mp4`);

                  console.log(`[API] Starting automated render to: ${finalPath}`);

                  renderTimeline(data, finalPath).catch(err => {
                    console.error('[API] Async Render Error:', err);
                  });

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, path: finalPath }));
                } catch (err) {
                  console.error('[API] Render Error (JSON/FS):', err);
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
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
