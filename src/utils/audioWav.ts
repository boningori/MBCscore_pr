// 録音した音声を 16kHz モノラル 16bit PCM の WAV へ正規化する。
//
// MediaRecorder の出力は Chrome が WebM/Opus、Safari が MP4 と割れる。
// さらに Gemini の音声入力で公式に案内されている形式に WebM は含まれない。
// 送る前にここで揃えることで、ブラウザ差と対応形式の両方を一度に解消する。
// 音声用途に16kHzモノラルで十分（5秒で約160KB）。

/** WAVのヘッダ長（RIFF 12 + fmt 24 + data 8） */
const WAV_HEADER_BYTES = 44;

export function encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const dataBytes = samples.length * 2;
    const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
    const view = new DataView(buffer);

    const writeAscii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(8, 'WAVE');

    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);               // fmtチャンクのサイズ
    view.setUint16(20, 1, true);                // PCM
    view.setUint16(22, 1, true);                // モノラル
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);   // バイト/秒
    view.setUint16(32, 2, true);                // ブロックアライン
    view.setUint16(34, 16, true);               // ビット深度

    writeAscii(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = WAV_HEADER_BYTES;
    for (let i = 0; i < samples.length; i++) {
        // クリップしないと音割れした入力で int16 が巻き戻り、轟音になる
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        offset += 2;
    }

    return buffer;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    return new Blob([encodeWavBuffer(samples, sampleRate)], { type: 'audio/wav' });
}

/**
 * 録音Blobをデコードし、モノラル・指定レートへリサンプルしてWAVにする。
 * ブラウザ実装（AudioContext / OfflineAudioContext）に依存するため、
 * このレイヤはテストせず実機で確認する。
 */
export async function blobToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();

    const decodeContext = new AudioContext();
    let decoded: AudioBuffer;
    try {
        decoded = await decodeContext.decodeAudioData(arrayBuffer);
    } finally {
        await decodeContext.close();
    }

    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frames, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    return encodeWav(rendered.getChannelData(0), targetRate);
}
