import { AudioClient } from './audio-client';
import { musicTapes } from './music-tapes';
import { initScrollFade } from './scroll-fade';
import { createSongElement } from './playlist';
import { localTapes, initUpload } from './upload';
import type { MusicTapeInfo } from './shared-types';

const audioClient = new AudioClient();

const playlistEl = document.getElementById('playlist')!;

// Built-in tapes use a non-negative data-song index into musicTapes; locally-uploaded
// tapes use a negative index (-1 -> localTapes[0], -2 -> localTapes[1], ...).
function resolveTape(songIndex: number): MusicTapeInfo {
  return songIndex >= 0 ? musicTapes[songIndex] : localTapes[-songIndex - 1];
}

export async function onSongClick(e: Event) {
  if ((e.currentTarget as HTMLDivElement).classList.contains('active')) {
    audioClient.onPlayButton();
  } else {
    document.querySelector('#playlist > li.active')?.classList.remove('active', 'playing');
    (e.currentTarget as HTMLDivElement).classList.add('active');
    const songIndex = parseInt((e.currentTarget as HTMLElement).dataset.song!, 10);

    await audioClient.playMusic(resolveTape(songIndex));
  }
}

// Build the playlist from the tape list (the single source of truth for order + metadata).
musicTapes.forEach((tape, i) => {
  const songEl = createSongElement(tape, i);
  songEl.addEventListener('click', onSongClick);
  playlistEl.appendChild(songEl);
});

initScrollFade();
initUpload(onSongClick);
