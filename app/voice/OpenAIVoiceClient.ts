import { RealtimeClient } from "@openai/realtime-api-beta";
import { VoiceClient, VoiceClientConfig, VoiceClientCallbacks } from "./VoiceClient";
import { downsampleAudio } from "./audioUtils";

const HEARTBEAT_INTERVAL_MS = 20000;
const RECONNECT_MAX_ATTEMPTS = 5;

/**
 * OpenAI Realtime API voice client implementation.
 *
 * Wraps the @openai/realtime-api-beta RealtimeClient and translates its
 * event-based API to the VoiceClient callback interface.
 */
export class OpenAIVoiceClient implements VoiceClient {
  readonly inputSampleRate = 24000;

  private client: RealtimeClient | null = null;
  private config: VoiceClientConfig;
  private callbacks: VoiceClientCallbacks;
  private connected = false;
  private reconnectAttempts = 0;
  private heartbeatInterval: number | null = null;

  constructor(config: VoiceClientConfig, callbacks: VoiceClientCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    try {
      console.log("Initializing OpenAI client...");
      console.log("OpenAI model:", this.config.model);
      console.log("OpenAI voice:", this.config.voice);
      console.log("OpenAI API key present:", !!this.config.apiKey);
      this.client = new RealtimeClient({
        model: this.config.model,
        apiKey: this.config.apiKey,
        dangerouslyAllowAPIKeyInBrowser: true,
      });

      await this.client.updateSession({
        instructions: this.config.systemPrompt,
        voice: this.config.voice as any,
        turn_detection: {
          type: "server_vad",
          threshold: 0.8,
        },
        input_audio_transcription: { model: "whisper-1" },
        // @ts-ignore - input_audio_noise_reduction parameter may not be in types yet
        input_audio_noise_reduction: {
          type: "near_field",
        },
        idle_timeout: 60,
      } as any);

      // Wire up OpenAI events to VoiceClient callbacks
      this.client.on("conversation.updated", (event: any) => {
        console.log("OpenAI conversation.updated:", event);
        const { item, delta } = event;
        if (item.type === "message" && item.role === "assistant") {
          console.log("OpenAI: Assistant message detected");
          if (delta && delta.audio) {
            // Downsample 24kHz -> 16kHz before delivering to avatar
            const downsampled = downsampleAudio(delta.audio, 24000, 16000);
            this.callbacks.onAudioData(downsampled);
          }
        } else if (item.type === "message" && item.role === "user") {
          const transcript = item.content?.[0]?.transcript;
          if (transcript) {
            this.callbacks.onUserTranscript(transcript);
          }
        }
      });

      this.client.on("conversation.interrupted", () => {
        console.log("OpenAI: conversation.interrupted");
        this.callbacks.onInterruption();
        // Cancel the current response, matching original behavior
        try {
          this.client?.cancelResponse("");
        } catch (e) {
          console.warn("cancelResponse failed:", e);
        }
      });

      this.client.on("input_audio_buffer.speech_stopped", (event: any) => {
        console.log("Speech stopped event received", event);
      });

      // Handle connection errors and disconnections
      this.client.on("error", async (error: any) => {
        console.error("OpenAI RealtimeClient error:", error);
        this.connected = false;

        const msg = error?.message || error?.type || JSON.stringify(error);
        this.callbacks.onError(`Connection error: ${msg}`);

        // Detect common disconnect/session expiration messages and attempt reconnect
        const shouldReconnect =
          msg?.toString().toLowerCase().includes("not connected") ||
          msg?.toString().toLowerCase().includes("session") ||
          msg?.toString().toLowerCase().includes("expired") ||
          msg?.toString().toLowerCase().includes("reconnect");

        if (shouldReconnect) {
          this.attemptReconnect();
        }
      });

      // Listen for session updates that might indicate disconnection
      this.client.on("session_updated", (event: any) => {
        console.log("Session updated event:", JSON.stringify(event, null, 2));
        if (
          event.session?.status === "closed" ||
          event.session?.status === "error"
        ) {
          console.warn(
            "OpenAI session closed or errored:",
            event.session?.status
          );
          this.connected = false;
          this.attemptReconnect();
        }
      });

      await this.client.connect();
      console.log("OpenAI Client connected successfully");
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.callbacks.onConnected();
    } catch (error: any) {
      console.error("Error initializing OpenAI client:", error);
      this.connected = false;
      this.callbacks.onError(
        `Failed to initialize OpenAI client: ${error.message}`
      );
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    this.connected = false;
    this.clearHeartbeat();
    this.reconnectAttempts = 0;
    try {
      this.client?.disconnect();
    } catch (e) {
      console.warn("Error disconnecting OpenAI client:", e);
    }
    this.client = null;
    this.callbacks.onDisconnected();
  }

  sendAudio(audio: Int16Array): void {
    if (this.connected && this.client) {
      try {
        this.client.appendInputAudio(audio);
      } catch (error: any) {
        if (
          error.message?.includes("not connected") ||
          error.message?.includes("connection")
        ) {
          console.warn(
            "Connection lost, stopping audio transmission:",
            error.message
          );
          this.connected = false;
          this.callbacks.onError("Connection lost. Please restart the interaction.");
        } else {
          console.error("Error appending input audio:", error);
        }
      }
    }
  }

  triggerResponse(): void {
    console.log("OpenAI: triggerResponse called, client connected:", this.connected);
    try {
      if (this.config.aiSpeaksFirst) {
        console.log("OpenAI: Injecting greeting prompt for AI-speaks-first");
        this.client?.sendUserMessageContent([
          { type: "input_text", text: "Please greet me and introduce yourself briefly." }
        ]);
        // sendUserMessageContent calls createResponse() internally
      } else {
        this.client?.createResponse();
      }
      console.log("OpenAI: triggerResponse completed");
    } catch (err) {
      console.warn("createResponse failed (non-fatal):", err);
    }
  }

  cancelResponse(): void {
    try {
      this.client?.cancelResponse("");
    } catch (e) {
      console.warn("cancelResponse failed:", e);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Heartbeat ---

  private startHeartbeat(): void {
    this.clearHeartbeat();
    if (!this.client) return;
    this.heartbeatInterval = window.setInterval(() => {
      try {
        // @ts-ignore - client may expose a sendEvent or similar
        if (this.client?.sendEvent) {
          // @ts-ignore
          this.client.sendEvent("heartbeat", { ts: Date.now() });
        }
      } catch (err: any) {
        console.warn("Heartbeat failed:", err);
      }
    }, HEARTBEAT_INTERVAL_MS) as unknown as number;
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // --- Reconnection ---

  private attemptReconnect(): void {
    if (this.connected) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      console.warn("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts += 1;
    const attempt = this.reconnectAttempts;
    const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt));

    console.log(`Attempting reconnect #${attempt} in ${backoffMs}ms`);
    this.clearHeartbeat();

    setTimeout(async () => {
      try {
        // Disconnect old client before reconnecting
        try {
          this.client?.disconnect();
        } catch (e) {}
        this.client = null;

        // Reconnect - onConnected callback will fire if successful
        await this.connect();
      } catch (err) {
        console.warn("Reconnect attempt failed:", err);
        this.attemptReconnect();
      }
    }, backoffMs);
  }
}
