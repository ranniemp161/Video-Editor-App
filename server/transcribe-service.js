import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findFile } from './path-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const whisperPath = path.resolve(__dirname, '..', '..', '..', 'claude project rannie', 'my-video', 'whisper.cpp');
const model = "base.en";

export async function transcribeVideo(videoPath) {
    console.log(`[Transcribe Service] Received request for: ${videoPath}`);
    const fullVideoPath = findFile(videoPath);
    console.log(`[Transcribe Service] Resolved full path: ${fullVideoPath}`);

    if (!fullVideoPath) {
        console.error(`[Transcribe Service] File NOT FOUND: ${videoPath}`);
        throw new Error(`Video file not found: ${videoPath}`);
    }

    const outputWav = path.join(path.dirname(fullVideoPath), `temp_transcribe_${Date.now()}.wav`);

    // 1. Extract audio (Asynchronous)
    console.log(`[Transcribe Service] Extracting audio: ${fullVideoPath} -> ${outputWav}`);
    await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ['-y', '-i', fullVideoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputWav]);
        let stderr = "";
        ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });
        ffmpeg.on('close', (code) => {
            if (code === 0) resolve();
            else {
                console.error(`[Transcribe Service] FFmpeg failed. Code: ${code}, Stderr: ${stderr}`);
                reject(new Error(`FFmpeg failed to extract audio.`));
            }
        });
        ffmpeg.on('error', (err) => {
            console.error(`[Transcribe Service] FFmpeg spawn error:`, err);
            reject(err);
        });
    });

    const modelPath = path.join(whisperPath, "models", `ggml-${model}.bin`);
    const exePath = path.join(whisperPath, "main.exe");

    if (!fs.existsSync(exePath)) {
        throw new Error(`Whisper executable not found at ${exePath}`);
    }

    const args = [
        '-m', modelPath,
        '-f', outputWav,
        '-ml', '1',
        '-oj'
    ];

    return new Promise((resolve, reject) => {
        console.log(`[Transcribe Service] Running whisper.cpp on ${outputWav}...`);
        const whisper = spawn(exePath, args, { cwd: whisperPath });

        let stderr = "";
        whisper.stderr.on('data', (data) => { stderr += data.toString(); });

        whisper.on('close', (code) => {
            try {
                const generatedJson = outputWav + ".json";
                if (fs.existsSync(generatedJson)) {
                    const data = JSON.parse(fs.readFileSync(generatedJson, "utf-8"));
                    const segments = data.transcription || [];

                    // Map segments to a flat list of words
                    const words = segments.map(s => ({
                        word: s.text.trim(),
                        start: s.offsets.from, // Whisper.cpp offsets are in ms
                        end: s.offsets.to
                    })).filter(w => w.word.length > 0);

                    // Cleanup
                    fs.unlinkSync(generatedJson);
                    if (fs.existsSync(outputWav)) fs.unlinkSync(outputWav);

                    resolve({ transcription: data, words });
                } else {
                    console.error(`[Transcribe Service] Output JSON missing. Whisper stderr: ${stderr}`);
                    reject(new Error(`Whisper failed to generate transcript. Exit code: ${code}`));
                }
            } catch (err) {
                reject(err);
            }
        });

        whisper.on('error', (err) => {
            console.error(`[Transcribe Service] Process error:`, err);
            reject(err);
        });
    });
}
