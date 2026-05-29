import { AudioClient } from './audio-client';
import { musicTapes } from './music-tapes';
import './scroll-fade';
// import { localTapes} from './upload';

const audioClient = new AudioClient();

const songEls = document.querySelectorAll('#playlist > li');

// TODO: clean up
export async function onSongClick(e: Event) {
  if ((e.currentTarget as HTMLDivElement).classList.contains('active')) {
    audioClient.onPlayButton();
  } else {
    document.querySelector('#playlist > li.active')?.classList.remove('active', 'playing');
    (e.currentTarget as HTMLDivElement).classList.add('active');
    const songIndex = parseInt((e.currentTarget as HTMLElement).dataset.song!, 10);

    // HACK: negative song index means local tape
    // const song = songIndex >= 0 ? musicTapes[songIndex] : localTapes[-songIndex - 1];
    const song = musicTapes[songIndex];

    await audioClient.playMusic(song);
  }
}

songEls.forEach(el => el.addEventListener('click', onSongClick));