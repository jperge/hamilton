/**
 * Voice backend types and interfaces.
 *
 * The VoiceClient abstraction allows the avatar component to work with
 * different voice AI backends (OpenAI Realtime, Gemini Live) through
 * a uniform API.
 */

export type VoiceBackend = "openai" | "gemini";

export interface VoiceClientCallbacks {
  /**
   * Called when assistant audio is received.
   * Audio is ALWAYS 16kHz Int16Array, ready to send to Simli.
   * Each backend is responsible for converting its native output format.
   */
  onAudioData: (audio: Int16Array) => void;

  /** Called when the user's speech transcription is available */
  onUserTranscript: (transcript: string) => void;

  /** Called when the conversation is interrupted (user barge-in) */
  onInterruption: () => void;

  /** Called when the connection to the voice API is established */
  onConnected: () => void;

  /** Called on connection or protocol error */
  onError: (error: string) => void;

  /** Called when the connection is closed */
  onDisconnected: () => void;
}

export interface VoiceClientConfig {
  apiKey: string;
  model: string;
  voice: string;
  systemPrompt: string;
  /** When true, the AI will speak first with a greeting. Default: false */
  aiSpeaksFirst?: boolean;
}

export interface VoiceClient {
  /** Connect to the voice API */
  connect(): Promise<void>;

  /** Disconnect from the voice API */
  disconnect(): void;

  /**
   * Send raw microphone audio.
   * Input is Int16Array at the backend's expected input sample rate
   * (see inputSampleRate property).
   */
  sendAudio(audio: Int16Array): void;

  /**
   * Trigger an initial response from the assistant.
   * OpenAI needs explicit createResponse(); Gemini auto-responds via VAD.
   */
  triggerResponse(): void;

  /**
   * Cancel the current assistant response (for interruption handling).
   */
  cancelResponse(): void;

  /** Whether the client is currently connected */
  isConnected(): boolean;

  /**
   * The sample rate this backend expects for input audio from the microphone.
   * OpenAI: 24000, Gemini: 16000
   */
  readonly inputSampleRate: number;
}
