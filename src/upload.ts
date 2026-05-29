import type { MusicTape } from './shared-types';
import { decodeHCInt } from './tape-decoder';
import { onSongClick } from './index';

export const localTapes: MusicTape[] = [];

document.getElementById('upload')!.addEventListener('click', function () {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';

  fileInput.addEventListener('change', function (event: Event) {
    const target = event.target as HTMLInputElement;
    const file: File | undefined = target.files?.[0];

    if (file) {
      const filename = file.name;

      // Read file content as Uint8Array
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>): void {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8Array: Uint8Array = new Uint8Array(arrayBuffer);

        // Use the filename and uint8Array here
        handleFile(filename, uint8Array);
      };

      reader.readAsArrayBuffer(file);
    }
  });

  // Trigger the file picker
  fileInput.click();
});

function handleFile(filename: string, data: Uint8Array) {
  try {
    const voices = decodeHCInt(data);

    localTapes.push({
      url: `local://${filename}`,
      data,
      tempo: 0,
      voices
    });

    console.log(localTapes);

    const playlistEl = document.getElementById('playlist')!;
    const songEl = document.createElement('li');
    songEl.innerHTML = `
      <div class="info">
        ${filename}
      </div>
      <div class="play-button"><div class="play-icon"></div></div>
    `;

    songEl.dataset.song = (-localTapes.length).toString();

    playlistEl.appendChild(songEl);
    playlistEl.scrollTo({ top: playlistEl.scrollHeight, behavior: 'smooth' });

    songEl.addEventListener('click', onSongClick);
    songEl.click();

  } catch (ex) {
    alert('invalid tape file');
  }
}