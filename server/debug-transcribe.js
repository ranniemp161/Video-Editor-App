import { transcribeVideo } from './transcribe-service.js';

async function test() {
    const testFile = 'SubiShopWelcome.mp4';
    console.log(`--- Testing Transcription for: ${testFile} ---`);
    try {
        const result = await transcribeVideo(testFile);
        console.log('--- Transcription Result Structure ---');
        console.log('Keys:', Object.keys(result));
        if (result.transcription && result.transcription.length > 0) {
            console.log('--- First Segment ---');
            console.log(JSON.stringify(result.transcription[0], null, 2));
            console.log('---------------------');
        }
        console.log('-------------------------------------');
        resolve(result); // For wait
    } catch (err) {
        console.error('FAILED!');
        console.error(err.message);
    }
}

test();
