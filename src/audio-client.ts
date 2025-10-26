import type {
  DataTape,
  MusicTapeInfo,
  InitPDP1Message,
  LoadMusicMessage,
  RestartMessage,
  StopMessage,
  PDP1AudioMessage,
} from './shared-types';

const MUSIC_PLAYER_TAPE = 'tapes/pdp1m13.rim';

export class AudioClient {
  private playButton = document.getElementById('play') as HTMLButtonElement;
  private audioContext: AudioContext | null = null;
  private pdp1Audio: AudioWorkletNode | null = null;
  private needsInit = true;
  private playing = false;
  private compiled = false;
  private activeSongURL = '';
  private stoppedResolve: null | ((value: unknown) => void) = null;

  constructor() {
    this.playButton.addEventListener('click', this.onPlayButton);
  }

  public async playMusic(musicTapeInfo: MusicTapeInfo) {
    if (this.needsInit) {
      await this.init();
    }

    if (this.activeSongURL === musicTapeInfo.url) {
      this.pdp1Audio!.port.postMessage({ type: 'restart' } as RestartMessage);
      return;
    }

    if (this.playing) {
      // to prevent pop/click we suspend the context and wait for confirmed stop
      this.audioContext!.suspend();
      this.pdp1Audio!.port.postMessage({ type: 'stop' } as StopMessage);
      this.playing = false;
      await new Promise(resolve => this.stoppedResolve = resolve);
    }

    const musicTape = await this.fetchTape(musicTapeInfo.url);
    this.audioContext!.resume();

    this.activeSongURL = musicTape.url;
    this.pdp1Audio!.port.postMessage({
      type: 'load-music',
      tape: { ...musicTapeInfo, ...musicTape },
    } as LoadMusicMessage, [musicTape.data.buffer]);
  }

  private async init() {
    let { audioContext } = this;

    // disable the button while we load the PDP-1 audio processor
    this.playButton.disabled = true;
    this.playing = false;
    this.compiled = false;

    this.audioContext = audioContext = new AudioContext();

    // create the PDP-1 audio processor
    await audioContext.audioWorklet.addModule('scripts/pdp1-audio.js');
    this.pdp1Audio = new AudioWorkletNode(audioContext, 'pdp1-audio-processor', { outputChannelCount: [2] });
    this.pdp1Audio.port.onmessage = this.onPDP1AudioMessage;
    
    // Create a low pass filter with 2kHz cutoff
    const filterNode = audioContext.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 2000;
    
    // Connect the nodes
    this.pdp1Audio.connect(filterNode);
    filterNode.connect(audioContext.destination);

    await this.initPDP1();
    this.needsInit = false;
  }

  private onPDP1AudioMessage = (event: MessageEvent<any>) => {
    const message = event.data as PDP1AudioMessage;
    switch (message.type) {
      case 'logs':
        (message.logs as string[]).forEach(log => console.log(log));
        break;
      case 'compiled':
        this.playButton.textContent = 'pause';
        this.playButton.disabled = false;
        this.playing = true;
        this.compiled = true;
        break;
      case 'playback-ended':
        this.audioContext!.suspend();
        this.playButton.textContent = 'play';
        this.playing = false;
        break;
      case 'stopped':
        if (this.stoppedResolve) {
          this.stoppedResolve(null);
          this.stoppedResolve = null;
        }
    }
  };

  private onPlayButton = async () => {
    let { audioContext, playButton } = this;

    if (audioContext) {
      if (audioContext.state === 'running') {
        audioContext.suspend();
        playButton.textContent = 'play';
        this.playing = false;
      } else if (audioContext.state === 'suspended') {
        audioContext.resume();
        playButton.textContent = 'pause';

        if (!this.playing && this.compiled) {
          this.pdp1Audio!.port.postMessage({ type: 'restart' } as RestartMessage);
        }
      }
    }
  };

  private async initPDP1() {
    const musicPlayer = await this.fetchTape(MUSIC_PLAYER_TAPE);
    this.pdp1Audio!.port.postMessage({
      type: 'init',
      tape: musicPlayer,
    } as InitPDP1Message, [musicPlayer.data.buffer]);
  }

  private async fetchTape(url: string): Promise<DataTape> {
    const res = await fetch(url);
    return { url, data: new Uint8Array(await res.arrayBuffer()) };
  }
}