import type { MusicTapeInfo } from './shared-types';

// Builds a playlist row. songIndex is stored on data-song: a non-negative index refers to
// musicTapes; a negative index refers to a local upload (see resolveTape in index.ts).
export function createSongElement(tape: MusicTapeInfo, songIndex: number): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.song = songIndex.toString();

  const info = document.createElement('div');
  info.className = 'info';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = tape.title;
  info.appendChild(title);

  if (tape.artist) {
    const artist = document.createElement('div');
    artist.className = 'artist';
    artist.textContent = tape.artist;
    info.appendChild(artist);
  }

  const playButton = document.createElement('div');
  playButton.className = 'play-button';
  const playIcon = document.createElement('div');
  playIcon.className = 'play-icon';
  playButton.appendChild(playIcon);

  li.append(info, playButton);
  return li;
}
