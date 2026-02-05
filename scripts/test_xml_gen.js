import { generateXML } from '../server/xml-service.js';
import fs from 'fs';
import path from 'path';

const mockTimelineData = {
    timeline: {
        tracks: [
            {
                type: 'video',
                clips: [
                    { id: 'c1', assetId: 'a1', start: 0, end: 5, trimStart: 0, trimEnd: 5 },
                    { id: 'c2', assetId: 'a1', start: 5, end: 10, trimStart: 10, trimEnd: 15 },
                    { id: 'c3', assetId: 'a1', start: 10, end: 8, trimStart: 20, trimEnd: 18 }, // Invalid!
                ]
            }
        ]
    },
    assets: [
        { id: 'a1', name: 'test & video.mp4', duration: 30, src: 'C:/Videos/test & video.mp4' }
    ]
};

const outputPath = path.resolve('public/exports/test_fix.xml');
try {
    generateXML(mockTimelineData, outputPath);
    console.log('XML Generated at', outputPath);
    const content = fs.readFileSync(outputPath, 'utf8');
    console.log('--- XML CONTENT ---');
    console.log(content);
} catch (e) {
    console.error('Generation failed:', e);
}
