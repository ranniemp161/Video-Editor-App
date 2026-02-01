import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { renderTimeline } from './render-service.js';
import os from 'os';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/render' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);
                const downloadsDir = path.join(os.homedir(), 'Downloads');
                const timestamp = Date.now();
                const finalPath = path.join(downloadsDir, `render_${timestamp}.mp4`);

                console.log(`[API] Starting automated render to: ${finalPath}`);

                await renderTimeline(data, finalPath);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: finalPath }));
              } catch (err) {
                console.error('[API] Render Error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }
          next();
        });
      }
    },
    plugins: [react()],
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
