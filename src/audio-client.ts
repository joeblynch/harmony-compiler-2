import type {
  DataTape,
  MusicTapeInfo,
  InitPDP1Message,
  LoadMusicMessage,
  RestartMessage,
  StopMessage,
  RecompileMessage,
  PatchPitchTableMessage,
  PDP1AudioMessage,
  MusicTape,
} from './shared-types';

const MUSIC_PLAYER_TAPE = 'tapes/pdp1m13.rim';

// A locally-uploaded tape arrives already decoded (it carries its `data`); a built-in tape
// is just metadata and must be fetched.
function isLoadedTape(tape: MusicTapeInfo): tape is MusicTape {
  return 'data' in tape && (tape as MusicTape).data instanceof Uint8Array;
}

export class AudioClient {
  private recompileButtonEl = document.getElementById('recompile') as HTMLButtonElement;
  private twInputEl = document.getElementById('tw-input') as HTMLInputElement;
  private programFlagBulbEls = document.querySelectorAll('#program-flags .bulb');
  private logsEl = document.getElementById('logs') as HTMLDivElement;
  private audioContext: AudioContext | null = null;
  private pdp1Audio: AudioWorkletNode | null = null;
  private needsInit = true;
  private playing = false;
  private songComplete = false;
  private compiled = false;
  private activeSongURL = '';
  private activeTape: MusicTapeInfo | null = null;
  private stoppedResolve: null | ((value: unknown) => void) = null;
  // The tuning chosen in the UI (temperament + pitch reference + CHM
  // compensation) vs. the variant currently patched into the worklet's
  // frequency table (pt). pt persists across songs, so a patch tape is only
  // (re)applied when these differ. After init(), pt holds the ROM (equal-440) table.
  private selectedTemperament = 'equal';
  private chmEnabled = false;
  private pitchA = 440;
  private appliedVariant: string | null = null;
  private patchTapes = new Map<string, DataTape>();

  constructor() {
    this.recompileButtonEl.addEventListener('click', this.onRecompileButton);
    // Enter in the test-word (tempo) field recompiles, like clicking the button.
    this.twInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.onRecompileButton();
      }
    });
  }

  public async playMusic(musicTapeInfo: MusicTapeInfo) {
    if (this.needsInit) {
      await this.init();
    }

    this.songComplete = false;
    this.activeTape = musicTapeInfo;

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

    const musicTape = isLoadedTape(musicTapeInfo) ? musicTapeInfo : await this.fetchTape(musicTapeInfo.url);
    this.audioContext!.resume();

    this.activeSongURL = musicTape.url;
    this.twInputEl.value = musicTapeInfo.tempo.toString(8);

    // A fresh tape is about to be loaded and compiled; clear the prior tape's compiled state.
    this.compiled = false;

    // Patch the frequency table to the selected temperament (if changed) before
    // the voices are read and compiled below.
    await this.ensurePitchTablePatched();

    // Transfer a disposable copy so the source buffer (a local tape's only copy) is not detached.
    const sendData = new Uint8Array(musicTape.data);
    this.pdp1Audio!.port.postMessage({
      type: 'load-music',
      tape: { ...musicTapeInfo, ...musicTape, data: sendData },
    } as LoadMusicMessage, [sendData.buffer]);
  }

  private async init() {
    let { audioContext } = this;

    this.playing = false;
    this.compiled = false;
    // A fresh readIn of the player ROM leaves the equal-tempered (440) table in pt.
    this.appliedVariant = 'equal-440';

    this.audioContext = audioContext = new AudioContext();

    // create the PDP-1 audio processor
    await audioContext.audioWorklet.addModule('scripts/pdp1-audio.js');
    this.pdp1Audio = new AudioWorkletNode(audioContext, 'pdp1-audio-processor', { outputChannelCount: [2] });
    this.pdp1Audio.port.onmessage = this.onPDP1AudioMessage;
    
    // create a lowpass filter with 2kHz cutoff
    const lowpassFilter = audioContext.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = 2000;
    lowpassFilter.Q.value = 0.5; // simulate 1-pole RC filter on PDP-1

    // create a highpass filter to cut DC offset. post-processing in my headphones pops and cracks otherwise
    const highpassFilter = audioContext.createBiquadFilter();
    highpassFilter.type = 'highpass'
    highpassFilter.frequency.value = 30;
    highpassFilter.Q.value = Math.sqrt(2) / 2; // flat Buttersworth response
    
    // connect the nodes
    this.pdp1Audio.connect(lowpassFilter);
    lowpassFilter.connect(highpassFilter);
    highpassFilter.connect(audioContext.destination);

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
        this.twInputEl.disabled = false;
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
    const testWordInput = this.twInputEl.value;
    if (testWordInput) {
      const testWord = parseInt(testWordInput, 8);
      if (testWord !== 0 && (isNaN(testWord) || testWord < 0o40 || testWord > 0o1377)) {
        alert('invalid tempo. range: 40 to 1377 octal.');
        return;
      }

      this.pdp1Audio?.port.postMessage({
        type: 'recompile',
        testWord,
      } as RecompileMessage)

      // Persist the new tempo to the tape entry so it survives switching away and back.
      if (this.activeTape) {
        this.activeTape.tempo = testWord;
      }

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

  // Tuning controls. Each updates state then re-applies to the active song (a
  // full reload, so the voices are re-read and recompiled against the patched
  // pt). With no worklet/song yet, the selection applies on the next play.
  public async setTemperament(key: string) {
    this.selectedTemperament = key;
    await this.reapplyTuning();
  }

  public async setChm(enabled: boolean) {
    this.chmEnabled = enabled;
    await this.reapplyTuning();
  }

  public async setA415(enabled: boolean) {
    this.pitchA = enabled ? 415 : 440;
    await this.reapplyTuning();
  }

  // Composite key identifying the patch tape: <temperament>-<pitchA>[-chm].
  private variantKey(): string {
    return `${this.selectedTemperament}-${this.pitchA}${this.chmEnabled ? '-chm' : ''}`;
  }

  private async reapplyTuning() {
    if (this.needsInit || !this.activeTape) {
      return;
    }
    // Force a full reload (bypass the same-song restart shortcut).
    this.activeSongURL = '';
    await this.playMusic(this.activeTape);
  }

  // RIM-load the selected variant's patch tape into pt, unless pt already holds
  // it (pt persists in worklet memory across songs).
  private async ensurePitchTablePatched() {
    const key = this.variantKey();
    if (key === this.appliedVariant) {
      return;
    }

    let patch = this.patchTapes.get(key);
    if (!patch) {
      patch = await this.fetchTape(`tapes/patches/${key}.bin`);
      this.patchTapes.set(key, patch);
    }

    // Transfer a disposable copy so the cached patch buffer is not detached.
    const sendData = new Uint8Array(patch.data);
    this.pdp1Audio!.port.postMessage({
      type: 'patch-pitch-table',
      tape: { url: patch.url, data: sendData },
    } as PatchPitchTableMessage, [sendData.buffer]);

    this.appliedVariant = key;
  }

  private addLogs(logs: string[]) {
    const { logsEl } = this;
    logs.forEach((log) => {
      const logEl = document.createElement('div');
      logEl.innerText = log;
      if (log[0] === '#') {
        logEl.classList.add('log-comment');
      }

      logsEl.appendChild(logEl);
    });

    logsEl.scrollTop = logsEl.scrollHeight;
  }
}