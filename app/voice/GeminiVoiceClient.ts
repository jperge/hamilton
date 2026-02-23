import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceClient, VoiceClientConfig, VoiceClientCallbacks } from "./VoiceClient";
import { downsampleAudio, base64ToInt16Array, int16ArrayToBase64 } from "./audioUtils";

/**
 * Google Gemini Live API voice client implementation.
 *
 * Uses @google/genai SDK's live.connect() method to establish a WebSocket
 * session for bidirectional audio streaming.
 */
export class GeminiVoiceClient implements VoiceClient {
  readonly inputSampleRate = 16000;

  private session: any = null;
  private config: VoiceClientConfig;
  private callbacks: VoiceClientCallbacks;
  private connected = false;
  private ai: GoogleGenAI;

  constructor(config: VoiceClientConfig, callbacks: VoiceClientCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async connect(): Promise<void> {
    try {
      console.log("Initializing Gemini Live client...");
      console.log("Model:", this.config.model);
      console.log("Voice:", this.config.voice);

      this.session = await this.ai.live.connect({
        model: this.config.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: this.config.systemPrompt,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: this.config.voice },
            },
          },
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live WebSocket opened");
            // Note: Don't call onConnected here because this.session
            // hasn't been assigned yet (we're still inside the await).
            // onConnected is called below after session is assigned.
          },
          onmessage: (message: any) => {
            this.handleMessage(message);
          },
          onerror: (e: any) => {
            console.error("Gemini Live error:", e);
            this.connected = false;
            this.callbacks.onError(e?.message || e?.error?.message || "Gemini connection error");
          },
          onclose: (e: any) => {
            console.log("Gemini Live session closed:", e?.reason || "unknown");
            this.connected = false;
            this.callbacks.onDisconnected();
          },
        },
      });

      // Session is now assigned — mark as connected and notify
      console.log("Gemini Live session established successfully");
      this.connected = true;
      this.callbacks.onConnected();
    } catch (error: any) {
      console.error("Error initializing Gemini Live client:", error);
      this.connected = false;
      this.callbacks.onError(
        `Failed to initialize Gemini Live client: ${error.message}`
      );
    }
  }

  disconnect(): void {
    this.connected = false;
    try {
      this.session?.close();
    } catch (e) {
      console.warn("Error closing Gemini Live session:", e);
    }
    this.session = null;
    this.callbacks.onDisconnected();
  }

  sendAudio(audio: Int16Array): void {
    if (this.connected && this.session) {
      try {
        const base64Data = int16ArrayToBase64(audio);
        this.session.sendRealtimeInput({
          audio: {
            data: base64Data,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (error: any) {
        console.error("Error sending audio to Gemini:", error);
        if (
          error.message?.includes("not connected") ||
          error.message?.includes("closed")
        ) {
          this.connected = false;
          this.callbacks.onError("Connection lost. Please restart the interaction.");
        }
      }
    }
  }

  triggerResponse(): void {
    // No-op: Gemini Live responds automatically via built-in VAD.
    // The model starts generating a response when it detects the user
    // has finished speaking.
  }

  cancelResponse(): void {
    // Gemini handles interruption automatically when the user starts
    // speaking again. The interrupted flag in onmessage signals this.
    // No explicit cancel API is needed.
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Process incoming messages from the Gemini Live session.
   */
  private handleMessage(message: any): void {
    // Skip setup complete messages
    if (message.setupComplete) {
      console.log("Gemini: Setup complete");
      return;
    }

    // Handle interruption
    if (message.serverContent?.interrupted) {
      console.warn("Gemini: User interrupted the conversation");
      this.callbacks.onInterruption();
      return;
    }

    // Handle audio data from the model
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          try {
            // Gemini sends base64-encoded PCM16 at 24kHz
            const raw = base64ToInt16Array(part.inlineData.data);
            // Downsample to 16kHz for Simli
            const downsampled = downsampleAudio(raw, 24000, 16000);
            this.callbacks.onAudioData(downsampled);
          } catch (err) {
            console.error("Error processing Gemini audio chunk:", err);
          }
        }
      }
    }

    // Handle user transcription if available
    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (inputTranscript) {
      this.callbacks.onUserTranscript(inputTranscript);
    }

    // Handle output transcription if available
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      console.log("Gemini assistant:", outputTranscript);
    }

    // Handle turn completion
    if (message.serverContent?.turnComplete) {
      console.log("Gemini: Turn complete");
    }
  }
}
