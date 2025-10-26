import { AudioClient } from './audio-client';
import { musicTapes } from './music-tapes';

const audioClient = new AudioClient();

const songEls = document.querySelectorAll('#playlist > li');

songEls.forEach(el => el.addEventListener('click', async (e) => {
  const songIndex = parseInt((e.currentTarget as HTMLElement).dataset.song!, 10);
  await audioClient.playMusic(musicTapes[songIndex]);
}));