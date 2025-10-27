import type {
  DataTape,
  MusicTapeInfo,
  InitPDP1Message,
  LoadMusicMessage,
  RestartMessage,
  StopMessage,
  RecompileMessage,
  PDP1AudioMessage,
} from './shared-types';

const MUSIC_PLAYER_TAPE = 'tapes/pdp1m13.rim';

export class AudioClient {
  private recompileButtonEl = document.getElementById('recompile') as HTMLButtonElement;
  private programFlagBulbEls = document.querySelectorAll('#program-flags .bulb');
  private logsEl = document.getElementById('logs') as HTMLDivElement;
  private audioContext: AudioContext | null = null;
  private pdp1Audio: AudioWorkletNode | null = null;
  private needsInit = true;
  private playing = false;
  private songComplete = false;
  private compiled = false;
  private activeSongURL = '';
  private stoppedResolve: null | ((value: unknown) => void) = null;

  constructor() {
    this.recompileButtonEl.addEventListener('click', this.onRecompileButton);
  }

  public async playMusic(musicTapeInfo: MusicTapeInfo) {
    if (this.needsInit) {
      await this.init();
    }

    this.songComplete = false;

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
        this.addLogs(message.logs);
        break;
      case 'compiled':
        this.recompileButtonEl.disabled = false;
        this.playing = true;
        this.compiled = true;
        document.querySelector('#playlist > li.active')?.classList.add('playing');
        break;
      case 'playback-ended':
        this.audioContext!.suspend();
        this.playing = false;
        document.querySelector('#playlist > li.active')?.classList.remove('playing');
        this.songComplete = true;
        break;
      case 'stopped':
        if (this.stoppedResolve) {
          this.stoppedResolve(null);
          this.stoppedResolve = null;
        }
        break;
      case 'frame-update':
        message.pfDutyCycle.forEach(
          (dc, i) => (this.programFlagBulbEls[i] as HTMLDivElement).style.opacity = dc.toString()
        );
        break;
    }
  };

  onPlayButton = async () => {
    let { audioContext } = this;

    if (audioContext!.state === 'running') {
      this.pause();
    } else if (audioContext!.state === 'suspended') {
      this.play();
    }
  };

  private onRecompileButton = async () => {
    const testWordInput = prompt('test word (octal)');
    if (testWordInput) {
      const testWord = parseInt(testWordInput, 8);
      if (testWord !== 0 && (isNaN(testWord) || testWord < 0o40 || testWord > 0o1377)) {
        alert('invalid tempo. range: 40 to 1377 octal.');
      }

      this.pdp1Audio?.port.postMessage({
        type: 'recompile',
        testWord,
      } as RecompileMessage)

      if (!this.playing) {
        this.play();
      }
    }
  };

  private play() {
    let { audioContext } = this;

    audioContext!.resume();
    this.playing = true;
    document.querySelector('#playlist > li.active')?.classList.add('playing');

    if (this.songComplete && this.compiled) {
      this.pdp1Audio!.port.postMessage({ type: 'restart' } as RestartMessage);
    }
  }

  private pause() {
    let { audioContext } = this;
    audioContext!.suspend();
    this.playing = false;
    document.querySelector('#playlist > li.active')?.classList.remove('playing');
  }

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

  private addLogs(logs: string[]) {
    const { logsEl } = this;
    logs.forEach((log) => {
      const logEl = document.createElement('div');
      logEl.innerText = log;
      if (log.startsWith('#')) {
        logEl.classList.add('comment');
      }

      logsEl.appendChild(logEl);
    });

    logsEl.scrollTop = logsEl.scrollHeight;
  }
}