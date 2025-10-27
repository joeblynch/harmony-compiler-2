export interface MusicTapeInfo {
  url: string;
  tempo: number;
  voices: number;
}

export interface DataTape {
  url: string;
  data: Uint8Array;
}

export type MusicTape = DataTape & MusicTapeInfo;

export interface InitPDP1Message {
  type: 'init';
  tape: DataTape;
}

export interface LogsMessage {
  type: 'logs';
  logs: string[];
}

export interface LoadMusicMessage {
  type: 'load-music';
  tape: MusicTape;
}

export interface CompiledMessage {
  type: 'compiled';
}

export interface PlaybackEndedMessage {
  type: 'playback-ended';
}

export interface RestartMessage {
  type: 'restart';
}

export interface StopMessage {
  type: 'stop';
}

export interface StoppedMessage {
  type: 'stopped';
}

export interface RecompileMessage {
  type: 'recompile';
  testWord: number;
}

export interface FrameUpdateMessage {
  type: 'frame-update';
  pfDutyCycle: number[];
}

export type PDP1AudioMessage =
  | InitPDP1Message
  | LogsMessage
  | CompiledMessage
  | LoadMusicMessage
  | PlaybackEndedMessage
  | RestartMessage
  | StopMessage
  | StoppedMessage
  | RecompileMessage
  | FrameUpdateMessage;