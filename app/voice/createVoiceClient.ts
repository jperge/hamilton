import { VoiceBackend, VoiceClient, VoiceClientConfig, VoiceClientCallbacks } from "./VoiceClient";
import { OpenAIVoiceClient } from "./OpenAIVoiceClient";
import { GeminiVoiceClient } from "./GeminiVoiceClient";

/**
 * Factory function to create a VoiceClient based on the selected backend.
 */
export function createVoiceClient(
  backend: VoiceBackend,
  config: VoiceClientConfig,
  callbacks: VoiceClientCallbacks
): VoiceClient {
  switch (backend) {
    case "openai":
      return new OpenAIVoiceClient(config, callbacks);
    case "gemini":
      return new GeminiVoiceClient(config, callbacks);
    default:
      throw new Error(`Unknown voice backend: ${backend}`);
  }
}
