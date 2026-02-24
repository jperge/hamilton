import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, ActivityHandling, TurnCoverage } from "@google/genai";
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
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private modelSpeaking = false;

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
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 20,
              silenceDurationMs: 200,
            },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            turnCoverage: TurnCoverage.TURN_INCLUDES_ALL_INPUT,
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
      this.startKeepalive();
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
    this.stopKeepalive();
    try {
      this.session?.close();
    } catch (e) {
      console.warn("Error closing Gemini Live session:", e);
    }
    this.session = null;
    this.callbacks.onDisconnected();
  }

  /**
   * Start sending silent audio frames every 5 seconds to prevent
   * the Gemini Live server from closing the connection due to inactivity.
   */
  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      if (this.connected && this.session && !this.modelSpeaking) {
        try {
          // Send 160 samples (10ms) of silence at 16kHz
          const silence = new Int16Array(160);
          const base64Data = int16ArrayToBase64(silence);
          this.session.sendRealtimeInput({
            audio: {
              data: base64Data,
              mimeType: "audio/pcm;rate=16000",
            },
          });
          console.log("Gemini keepalive: sent 10ms silence packet");
        } catch (e) {
          console.warn("Gemini keepalive failed:", e);
        }
      }
    }, 2000);
  }

  /**
   * Restart the keepalive timer so the next packet is sent
   * a full interval from now (called after turn completes).
   */
  private resetKeepalive(): void {
    if (this.connected) {
      this.startKeepalive();
    }
  }

  /**
   * Stop the keepalive interval.
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
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
    if (this.config.aiSpeaksFirst && this.connected && this.session) {
      try {
        console.log("Gemini: Injecting greeting prompt for AI-speaks-first");
        this.session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [{ text: "Please greet me and introduce yourself briefly." }],
            },
          ],
          turnComplete: true,
        });
      } catch (err) {
        console.warn("Gemini sendClientContent failed (non-fatal):", err);
      }
    }
    // When aiSpeaksFirst is false, remain a no-op — Gemini responds via VAD.
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

    // Handle interruption — user started speaking, model stops
    if (message.serverContent?.interrupted) {
      console.warn("Gemini: User interrupted the conversation");
      this.modelSpeaking = false;
      this.callbacks.onInterruption();
      return;
    }

    // Handle audio data from the model
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts) {
      this.modelSpeaking = true;
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

    // Handle turn completion — restart keepalive timer fresh
    if (message.serverContent?.turnComplete) {
      console.log("Gemini: Turn complete — restarting keepalive");
      this.modelSpeaking = false;
      this.resetKeepalive();
    }
  }
}
