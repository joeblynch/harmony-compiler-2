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
  tapeURL: string;
}

export interface PlaybackEndedMessage {
  type: 'playback-ended';
}

export type PDP1AudioMessage =
  | InitPDP1Message
  | LogsMessage
  | CompiledMessage
  | LoadMusicMessage
  | PlaybackEndedMessage;