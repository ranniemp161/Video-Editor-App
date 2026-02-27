import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderTimeline, getRenderProgress } from './render-service.js';
import { generateXML } from './xml-service.js';
import { generateEDL } from './edl-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure directories exist
const rendersDir = path.join(projectRoot, 'public', 'renders');
const exportsDir = path.join(projectRoot, 'public', 'exports');

if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

// Logging middleware
app.use((req, res, next) => {
    console.log(`[Renderer] ${req.method} ${req.url}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Render Progress
app.get('/api/render-progress', (req, res) => {
    res.json(getRenderProgress());
});

// Render Timeline
app.post('/api/render', async (req, res) => {
    try {
        const data = req.body;
        const fileName = `render_${Date.now()}.mp4`;
        const finalPath = path.join(rendersDir, fileName);

        console.log(`[Renderer] Starting render: ${finalPath}`);
        renderTimeline(data, finalPath).catch(err => console.error('[Renderer] Render Error:', err));

        res.json({ success: true, path: `/renders/${fileName}` });
    } catch (err) {
        console.error('[Renderer] Render API Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export XML
app.post('/api/export-xml', async (req, res) => {
    try {
        const data = req.body;
        const fileName = `rough_cut_${Date.now()}.xml`;
        const finalPath = path.join(exportsDir, fileName);

        console.log(`[Renderer] Generating XML: ${finalPath}`);
        generateXML(data, finalPath);

        res.json({ success: true, path: `/exports/${fileName}` });
    } catch (err) {
        console.error('[Renderer] XML Export API Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export EDL
app.post('/api/export-edl', async (req, res) => {
    try {
        const data = req.body;
        const fileName = `rough_cut_${Date.now()}.edl`;
        const finalPath = path.join(exportsDir, fileName);

        console.log(`[Renderer] Generating EDL: ${finalPath}`);
        generateEDL(data, finalPath);

        res.json({ success: true, path: `/exports/${fileName}` });
    } catch (err) {
        console.error('[Renderer] EDL Export API Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Renderer service running at http://localhost:${port}`);
});
