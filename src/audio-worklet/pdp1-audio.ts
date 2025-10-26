import { PDP1 } from '../pdp1';
import type {
  PDP1AudioMessage,
  CompiledMessage,
  DataTape,
  LogsMessage,
  MusicTape,
  PlaybackEndedMessage
} from '../shared-types';

// 3 banks needed for longest of the songs
const PDP1_MEMORY_BANKS = 3;

// CHM CPU speed variance, based on BoC Olson playback time
const CHM_CPU_FACTOR = 0.92559;

// Memory address of the `pla` symbol that starts playback
const PLAY_MEMORY_ADDRESS = 0o1671;
const JMP_PLA = 0o600000 | PLAY_MEMORY_ADDRESS;

class PDP1AudioProcessor extends AudioWorkletProcessor {
  private readonly pdp1: PDP1 = new PDP1(PDP1_MEMORY_BANKS);
  private firstPlayback = true;
  private sampleDuration = 1 / globalThis.sampleRate * 1e6;
  private cpuRunDuration = 0;
  private nextSampleTime = 0;
  private priorPF = 0;
  private priorCPURunDuration = 0;

  constructor() {
    super();
    this.port.onmessage = (event) => {
      const message = event.data as PDP1AudioMessage;
      switch (message.type) {
        case 'init': 
          this.initPDP1(message.tape);
          break;

        case 'load-music':
          this.loadMusic(message.tape);
          break;

        case 'restart':
          this.restart();
          break;
      }
    };
  }

  get musicTapeCompiled() {
    // program flag 6 indicates compilation
    return this.pdp1.programFlags & 0o1;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const { pdp1 } = this;

    if (!this.musicTapeCompiled || !pdp1.running) {
      return true;
    }

    const leftChannel = outputs[0][0];
    const rightChannel = outputs[0][1];

    for (let i = 0; i < leftChannel.length && pdp1.running;) {
      const duration = pdp1.continue() / CHM_CPU_FACTOR;
      this.cpuRunDuration += duration;
      
      while (this.nextSampleTime <= this.cpuRunDuration && i < leftChannel.length) {
        // Choose the state that's closest to the ideal sample time
        let pf: number;
        if (this.priorCPURunDuration <= this.nextSampleTime && this.nextSampleTime <= this.cpuRunDuration) {
          // Ideal sample time is between prior and current
          const fromNext = Math.abs(this.cpuRunDuration - this.nextSampleTime);
          const fromPrior = Math.abs(this.priorCPURunDuration - this.nextSampleTime);

          if (fromNext <= fromPrior) {
            pf = pdp1.programFlags;
          } else {
            pf = this.priorPF;
          }
        } else {
          // We've jumped past multiple sample points (shouldn't normally happen)
          pf = pdp1.programFlags;
        }

        let left: number
        let right: number;
        left = (pf & 0o40) ? 1 : 0;     // voice 1
        left += (pf & 0o20) ? -1 : 0;   // voice 2
        
        right = (pf & 0o10) ? 1 : 0;    // voice 3
        right += (pf & 0o04) ? -1 : 0;  // voice 4

        // TODO: volume control from client side
        left *= 0.4;
        right *= 0.4;

        leftChannel[i] = left;
        rightChannel[i] = right;
       
        // this.postLogs([`${left} ${right} ${pdp1.programFlags}`]);
        this.nextSampleTime += this.sampleDuration;
        i++;
      }

      this.priorPF = pdp1.programFlags;
      this.priorCPURunDuration = this.cpuRunDuration;
    }

    if (!pdp1.running) {
      this.port.postMessage({ type: 'playback-ended' } as PlaybackEndedMessage);
    }

    return true;
  }

  private initPDP1(musicPlayerTape: DataTape) {
    try {
      let logs: string[] = [];
      logs.push(`PDP-1 mem: 12K cpu: ${CHM_CPU_FACTOR * 100}% (CHM)`);

      logs.push('# load music player');

      this.pdp1.address = 0o4;
      logs.push('address = 4');
      
      this.pdp1.mountTape(musicPlayerTape.data);
      logs.push(`mount: ${musicPlayerTape.url}`);

      this.pdp1.readIn();
      logs.push('read in');

      this.postLogs(logs);
    } catch (ex: any) {
      this.postLogs([`error: ${ex.message}`]);
    }
  }

  private loadMusic(tape: MusicTape) {
    try {
      const { pdp1 } = this;
      let logs: string[] = [];

      // run normal until we start playback;
      if (pdp1.singleInstruction) {
        logs.push('single instruction = off');
        pdp1.singleInstruction = false;
      }

      if (!this.firstPlayback) {
        // clear prior tape data
        logs.push('# clear prior song');
        pdp1.address = 0o700;
        logs.push('address = 700');
        pdp1.start();
        logs.push('start');
      } else {
        this.firstPlayback = false;
      }

      // reset the start address if needed
      if (pdp1.address !== 0o4) {
        logs.push('# resume normal operation');
        pdp1.address = 0o4;
        logs.push('address = 4');
      }
      
      // switch to read music tape mode
      logs.push(`# read music tape (${tape.voices} voice${tape.voices > 1 ? 's' : ''})`);
      pdp1.setSenseSwitch(1, true);
      logs.push('sense switch 1 = on');
      
      // mount the music tape and read in its voices
      pdp1.mountTape(tape.data);
      logs.push(`mount: ${tape.url}`);

      for (let i = 0; i < tape.voices; i++) {
        pdp1.start();
        logs.push('start');
      }

      // set the tempo before compiling if needed
      if (pdp1.testWord !== tape.tempo) {
        logs.push('# set tempo');
        pdp1.testWord = tape.tempo;
        logs.push(`test word = ${tape.tempo.toString(8)}`);
      }

      // switch to music playback mode
      logs.push('# compile music');
      pdp1.setSenseSwitch(1, false);
      logs.push('sense switch 1 = off');

      // break at music playback, after compile completes
      pdp1.breakpoint = PLAY_MEMORY_ADDRESS;
      logs.push(`breakpoint = ${PLAY_MEMORY_ADDRESS.toString(8)} (pla)`);
      
      // run compile
      logs.push('start');
      this.postLogs(logs);
      pdp1.start();
    
      if (this.musicTapeCompiled) {
        pdp1.breakpoint = null;
        pdp1.singleInstruction = true;

        this.postLogs([
          `break pc: ${pdp1.pc.toString(8)}`,
          '# compiled, step instructions to sample audio',
          'breakpoint = null',
          'single instruction = on',
        ]);

        this.port.postMessage({ 'type': 'compiled', tapeURL: tape.url } as CompiledMessage);
      } else {
        this.postLogs([`error: compilation failed`]);  
      }
    } catch (ex: any) {
      this.postLogs([`error: ${ex.message}`]);
    }
  }

  private restart() {
    const logs = ['# restart playback'];
    if (this.pdp1.address !== 0o4) {
      this.pdp1.address = 0o4;
      logs.push('address = 4');
    }
    this.pdp1.start(0o4);
    logs.push('start');
    this.postLogs(logs);
  }

  private postLogs(logs: string[]) {
    this.port.postMessage({ type: 'logs', logs } as LogsMessage);
  }
}

registerProcessor('pdp1-audio-processor', PDP1AudioProcessor);