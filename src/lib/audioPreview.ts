/**
 * Client-side helper: take an uploaded audio file, slice the first
 * `durationSec` seconds and encode the slice as a WAV (PCM 16-bit stereo).
 *
 * WAV is chosen because it can be produced with plain Web Audio APIs — no
 * extra codec dependency. At 44.1 kHz stereo 16-bit, 30 seconds weighs
 * ≈5.3 MB; we downmix to mono 22.05 kHz which brings it to ≈1.3 MB. That's
 * still fine for preview bucket storage and plays back in every browser.
 */

export async function buildPreviewFromAudioFile(
  file: File,
  durationSec = 30,
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();

  const AudioCtx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext!;
  if (!AudioCtx) {
    throw new Error("Web Audio API not supported in this browser");
  }

  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try {
      await decodeCtx.close();
    } catch {
      // ignore
    }
  }

  const sampleRate = 22050;
  const channels = 1;
  const framesWanted = Math.min(
    Math.floor(durationSec * sampleRate),
    Math.floor(
      (decoded.duration * sampleRate) / 1, // cap at real duration
    ),
  );

  const offline = new OfflineAudioContext(channels, framesWanted, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  // Downmix to mono by routing through the offline context which has 1 channel.
  src.connect(offline.destination);
  src.start(0, 0, durationSec);
  const rendered = await offline.startRendering();

  const wav = encodeWav(rendered);
  const previewName = file.name.replace(/\.[^.]+$/, "") + "_preview.wav";
  return new File([wav], previewName, { type: "audio/wav" });
}

/** Encode an AudioBuffer as a 16-bit PCM WAV blob. */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arr = new ArrayBuffer(bufferLength);
  const view = new DataView(arr);

  let offset = 0;
  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  const writeUint32 = (v: number) => {
    view.setUint32(offset, v, true);
    offset += 4;
  };
  const writeUint16 = (v: number) => {
    view.setUint16(offset, v, true);
    offset += 2;
  };

  writeString("RIFF");
  writeUint32(36 + dataLength);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(format);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitDepth);
  writeString("data");
  writeUint32(dataLength);

  // Interleave channels and write 16-bit samples.
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arr], { type: "audio/wav" });
}
