import path from 'path';
import http from 'http';
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

  // Determine backend target:
  // - In Docker: container name 'backend' is resolvable via Docker internal network
  // - Locally without Docker: falls back to localhost:8000
  const backendTarget = process.env.BACKEND_URL || env.BACKEND_URL || 'http://localhost:8000';
  console.log(`[Vite Proxy] Configured to target backend at: ${backendTarget}`);

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
      // All /api/* and /uploads/* requests are proxied to the FastAPI backend.
      // This eliminates CORS issues in local dev and ensures consistent routing
      // regardless of whether VITE_API_URL is set or not.
      proxy: {
        // Exclude /api/upload — it's handled by the custom direct-stream middleware
        // below so that http-proxy never buffers the binary body (which causes the
        // "stuck at 1%" symptom for large files in Vite 6).
        '^/api/(?!upload($|/))': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          timeout: 3600000,
          proxyTimeout: 3600000,
          configure: (proxy) => {
            proxy.on('error', (err, req, res) => {
              console.error('[Vite Proxy Error]', err.message, '→', req.method, req.url);
              if ('headersSent' in res && !res.headersSent) {
                (res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
                (res as import('http').ServerResponse).end(JSON.stringify({
                  detail: `Proxy error: backend unreachable. ${err.message}`
                }));
              }
            });
          }
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [
      tailwindcss(),
      react(),
      {
        name: 'vite-plugin-render-api',
        configureServer(server) {

          // Direct streaming proxy for binary uploads.
          // The standard Vite proxy (http-proxy) buffers the entire request body before
          // forwarding, which causes uploads to stall at 1% for large files. This
          // middleware pipes the raw socket stream directly to the backend, bypassing
          // http-proxy entirely. The /api regex above also excludes /api/upload from
          // the standard proxy so this middleware always wins.
          server.middlewares.use('/api/upload', (req, res, next) => {
            if (req.method !== 'POST') return next();

            let target;
            try {
              target = new URL(backendTarget);
            } catch (e) {
              console.error('[Upload Proxy] Invalid backendTarget:', backendTarget);
              res.writeHead(500);
              return res.end('Invalid backend configuration');
            }

            const fileName = decodeURIComponent(req.headers['x-file-name'] as string || 'unknown');
            const contentLength = req.headers['content-length'];
            console.log(`[Upload Proxy] → ${target.origin}/api/upload  file="${fileName}"  size=${contentLength ? Math.round(Number(contentLength)/1024/1024) + 'MB' : 'unknown'}`);

            // Build forwarded headers: preserve Authorization, x-file-name, content-length.
            // Drop transfer-encoding so the backend sees a plain content-length body.
            const forwardHeaders: Record<string, string | string[]> = {};
            for (const [k, v] of Object.entries(req.headers)) {
              if (k === 'transfer-encoding') continue; // let Node handle framing
              if (v !== undefined) forwardHeaders[k] = v as string | string[];
            }
            forwardHeaders['host'] = target.host;
            forwardHeaders['connection'] = 'keep-alive';

            const proxyReq = http.request(
              {
                hostname: target.hostname,
                port: Number(target.port) || (target.protocol === 'https:' ? 443 : 80),
                path: '/api/upload',
                method: 'POST',
                headers: forwardHeaders,
                timeout: 3600000,
              },
              (proxyRes) => {
                console.log(`[Upload Proxy] Backend responded: ${proxyRes.statusCode}`);
                res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
                proxyRes.pipe(res, { end: true });
              }
            );

            proxyReq.on('error', (err) => {
              console.error('[Upload Proxy] Backend connection error:', err.message);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ detail: `Upload failed: cannot reach backend at ${backendTarget}. Is the server running? (${err.message})` }));
              }
            });

            proxyReq.on('timeout', () => {
              console.error('[Upload Proxy] Request timed out after 1 hour');
              proxyReq.destroy();
            });

            // Pipe raw request stream straight to backend — zero buffering
            req.pipe(proxyReq, { end: true });
          });

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
