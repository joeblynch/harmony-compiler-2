import { AudioClient } from './audio-client';
import { musicTapes } from './music-tapes';
import './scroll-fade';

const audioClient = new AudioClient();

const songEls = document.querySelectorAll('#playlist > li');

songEls.forEach(el => el.addEventListener('click', async (e) => {
  if ((e.currentTarget as HTMLDivElement).classList.contains('active')) {
    audioClient.onPlayButton();
  } else {
    document.querySelector('#playlist > li.active')?.classList.remove('active', 'playing');
    (e.currentTarget as HTMLDivElement).classList.add('active');
    const songIndex = parseInt((e.currentTarget as HTMLElement).dataset.song!, 10);
    await audioClient.playMusic(musicTapes[songIndex]);
  }
}));