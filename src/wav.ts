const fs = require('fs');

function writeWav(filePath: string, audioData: Buffer) {
  // WAV file parameters
  const numChannels = 2;        // Stereo
  const sampleRate = 44100;     // 44.1kHz
  const bitsPerSample = 16;     // 16-bit
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = audioData.length;
  
  // WAV header is 44 bytes
  const header = Buffer.alloc(44);
  
  // RIFF chunk descriptor
  header.write('RIFF', 0);                                    // ChunkID
  header.writeUInt32LE(36 + dataSize, 4);                     // ChunkSize
  header.write('WAVE', 8);                                    // Format
  
  // fmt sub-chunk
  header.write('fmt ', 12);                                   // Subchunk1ID
  header.writeUInt32LE(16, 16);                              // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);                               // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);                     // NumChannels
  header.writeUInt32LE(sampleRate, 24);                      // SampleRate
  header.writeUInt32LE(byteRate, 28);                        // ByteRate
  header.writeUInt16LE(blockAlign, 32);                      // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);                   // BitsPerSample
  
  // data sub-chunk
  header.write('data', 36);                                   // Subchunk2ID
  header.writeUInt32LE(dataSize, 40);                        // Subchunk2Size
  
  // Write header and audio data to file
  const wavBuffer = Buffer.concat([header, audioData]);
  fs.writeFileSync(filePath, wavBuffer);
}

module.exports = writeWav;