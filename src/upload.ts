import type { MusicTape } from './shared-types';
import { musicTapes } from './music-tapes';
import { decodeHCInt } from './tape-decoder';
import { createSongElement } from './playlist';

export const localTapes: MusicTape[] = [];

// Monotonic upload counter. Stamped into each (re)upload's url so the url changes every time,
// which forces AudioClient.playMusic to fully reload the new data instead of taking its
// "same url -> restart" shortcut (relevant when re-uploading the file that's currently playing).
let uploadCount = 0;

// The bare filename of a tape, used to match an upload to an existing tape. Works for both
// built-in urls (`tapes/<name>`) and local urls (`local://<n>/<name>`), and is unaffected by the
// per-upload version bump (only the segment before the last `/` changes).
function tapeFilename(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

// Wires up the "upload" button. Called from index.ts after the DOM/app is set up so this
// module has no top-level DOM access and no import back into index.ts (avoids a cycle).
export function initUpload(onSongClick: (e: Event) => void) {
  const uploadButton = document.getElementById('upload');
  if (!uploadButton) {
    return;
  }

  uploadButton.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';

    fileInput.addEventListener('change', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file: File | undefined = target.files?.[0];

      if (file) {
        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>): void => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          handleFile(file.name, new Uint8Array(arrayBuffer));
        };
        reader.readAsArrayBuffer(file);
      }
    });

    fileInput.click();
  });

  function handleFile(filename: string, data: Uint8Array) {
    let voices: number;
    try {
      voices = decodeHCInt(data);
    } catch (ex) {
      alert('invalid tape file');
      return;
    }

    // A new url each upload (basename preserved) forces playMusic to reload rather than restart.
    const url = `local://${++uploadCount}/${filename}`;
    let songEl: HTMLElement;

    // 1) Uploading a file whose name matches a built-in tape overrides that built-in's data in
    //    place, keeping its playlist slot, title/artist, and curated tempo.
    const builtinIndex = musicTapes.findIndex(t => tapeFilename(t.url) === filename);

    if (builtinIndex >= 0) {
      const overridden: MusicTape = { ...musicTapes[builtinIndex], data, voices, url };
      musicTapes[builtinIndex] = overridden;
      songEl = document.querySelector(`#playlist > li[data-song="${builtinIndex}"]`)!;
    } else {
      // 2) Re-uploading a local filename replaces that slot's data; 3) otherwise add a new row.
      const localIndex = localTapes.findIndex(t => tapeFilename(t.url) === filename);
      const tape: MusicTape = { url, data, tempo: 0, voices, title: filename };

      if (localIndex >= 0) {
        localTapes[localIndex] = tape;
        songEl = document.querySelector(`#playlist > li[data-song="${-(localIndex + 1)}"]`)!;
      } else {
        localTapes.push(tape);

        // Negative data-song marks a local tape: -1 -> localTapes[0], -2 -> localTapes[1], ...
        const playlistEl = document.getElementById('playlist')!;
        songEl = createSongElement(tape, -localTapes.length);

        playlistEl.appendChild(songEl);
        playlistEl.scrollTo({ top: playlistEl.scrollHeight, behavior: 'smooth' });

        songEl.addEventListener('click', onSongClick);
      }
    }

    // Clear stale state so the click routes through playMusic (not the active play/pause toggle)
    // and plays the freshly-loaded data from the start.
    songEl.classList.remove('active', 'playing');
    songEl.click();
  }
}
