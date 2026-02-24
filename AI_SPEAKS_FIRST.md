# AI Speaks First Feature

This document describes the `aiSpeaksFirst` feature, which allows the AI character (Hamilton) to initiate the conversation with a spoken greeting instead of waiting for the user to speak.

## Overview

By default, voice conversation apps require the human to speak first. The `aiSpeaksFirst` option reverses this: when the session connects, a hidden text prompt is injected into the conversation, causing the AI to generate a spoken greeting immediately.

The feature is implemented for both voice backends:

| Backend | SDK Method | Mechanism |
|---------|-----------|-----------|
| OpenAI Realtime | `sendUserMessageContent()` | Injects a user message + auto-calls `createResponse()` |
| Gemini Live | `sendClientContent()` | Sends a user turn with `turnComplete: true` to trigger generation |

## Architecture

```
page.tsx                          UI state: aiSpeaksFirst (checkbox)
  |
  v
SimliVoiceAvatar.tsx              Props: aiSpeaksFirst -> VoiceClientConfig
  |
  v
createVoiceClient.ts              Factory: passes config to backend
  |
  v
OpenAIVoiceClient.ts              triggerResponse() checks config.aiSpeaksFirst
  -- or --
GeminiVoiceClient.ts              triggerResponse() checks config.aiSpeaksFirst
  |
  v
AI generates spoken greeting
```

## Data Flow

1. User toggles the "Hamilton speaks first" checkbox in the UI (`page.tsx`)
2. The `aiSpeaksFirst` boolean is passed as a prop to `SimliVoiceAvatar`
3. `SimliVoiceAvatar` includes it in the `VoiceClientConfig` when creating the voice client
4. After the voice session connects, the `onConnected` callback calls `triggerResponse()`
5. Each backend's `triggerResponse()` checks `config.aiSpeaksFirst` to decide behavior

## Files Modified

| File | Role |
|------|------|
| `app/voice/VoiceClient.ts` | Config interface — added `aiSpeaksFirst?: boolean` |
| `app/voice/OpenAIVoiceClient.ts` | OpenAI implementation of `triggerResponse()` |
| `app/voice/GeminiVoiceClient.ts` | Gemini implementation of `triggerResponse()` |
| `app/SimliVoiceAvatar.tsx` | Threads the prop from UI to voice client config |
| `app/page.tsx` | UI state and checkbox toggle |

## Implementation Details

### 1. VoiceClientConfig (`app/voice/VoiceClient.ts`)

The `aiSpeaksFirst` field is an optional boolean on the shared config interface:

```typescript
export interface VoiceClientConfig {
  apiKey: string;
  model: string;
  voice: string;
  systemPrompt: string;
  /** When true, the AI will speak first with a greeting. Default: false */
  aiSpeaksFirst?: boolean;
}
```

No changes were made to the `VoiceClient` interface itself — `triggerResponse()` already existed and is the natural hook point.

### 2. OpenAI Backend (`app/voice/OpenAIVoiceClient.ts`)

When `aiSpeaksFirst` is true, `triggerResponse()` injects a hidden user text message via the `@openai/realtime-api-beta` SDK's `sendUserMessageContent()` method. This method sends a `conversation.item.create` event with `role: "user"` and then calls `createResponse()` internally.

```typescript
triggerResponse(): void {
  try {
    if (this.config.aiSpeaksFirst) {
      this.client?.sendUserMessageContent([
        { type: "input_text", text: "Please greet me and introduce yourself briefly." }
      ]);
      // sendUserMessageContent calls createResponse() internally
    } else {
      this.client?.createResponse();
    }
  } catch (err) {
    console.warn("createResponse failed (non-fatal):", err);
  }
}
```

**Why `sendUserMessageContent`?** The OpenAI Realtime API's `createResponse()` alone just puts the model into listening mode with server-side VAD. It does not cause the AI to speak. By injecting a user message first, the AI has something to respond to, and the system prompt ensures it responds in character.

**SDK reference:** `@openai/realtime-api-beta/lib/client.js` line 570 — `sendUserMessageContent(content)` creates the conversation item via `conversation.item.create`, then calls `this.createResponse()`.

### 3. Gemini Backend (`app/voice/GeminiVoiceClient.ts`)

When `aiSpeaksFirst` is true, `triggerResponse()` sends a text user turn via the `@google/genai` SDK's `sendClientContent()` method with `turnComplete: true`, which signals the model to generate a response.

```typescript
triggerResponse(): void {
  if (this.config.aiSpeaksFirst && this.connected && this.session) {
    try {
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
```

**Why `sendClientContent`?** Gemini Live normally relies on Voice Activity Detection (VAD) to detect when the user finishes speaking and then auto-responds. Without user audio, the model has nothing to respond to. `sendClientContent()` with `turnComplete: true` tells the model "the user's turn is done, generate a response now" — bypassing the need for audio input.

**When `aiSpeaksFirst` is false**, the method remains a no-op. Gemini's VAD handles turn-taking automatically once the user speaks.

### 4. SimliVoiceAvatar (`app/SimliVoiceAvatar.tsx`)

The component receives `aiSpeaksFirst` as a prop and passes it into the voice client config:

```typescript
interface SimliVoiceAvatarProps {
  // ... other props
  aiSpeaksFirst: boolean;
  // ...
}

// Inside initializeVoiceClient:
voiceClientRef.current = createVoiceClient(voiceBackend, {
  apiKey,
  model: voiceModel,
  voice: voiceName,
  systemPrompt: initialPrompt,
  aiSpeaksFirst,
}, { /* callbacks */ });
```

The `onConnected` callback triggers the greeting:

```typescript
onConnected: () => {
  isVoiceConnectedRef.current = true;
  if (!options?.skipTrigger) {
    voiceClientRef.current?.triggerResponse();
  }
  startRecording();
},
```

### 5. UI Toggle (`app/page.tsx`)

A checkbox in the bottom-right settings panel controls the feature:

```typescript
const [aiSpeaksFirst, setAiSpeaksFirst] = useState(true);

// In JSX:
<label className={`flex items-center gap-2 text-xs font-abc-repro-mono text-white ${
  isInteracting ? "opacity-50 pointer-events-none" : "cursor-pointer"
}`}>
  <input
    type="checkbox"
    checked={aiSpeaksFirst}
    onChange={(e) => setAiSpeaksFirst(e.target.checked)}
    disabled={isInteracting}
  />
  Hamilton speaks first
</label>
```

The checkbox is disabled during an active interaction to prevent mid-conversation changes.

## Greeting Prompt

Both backends use the same hidden prompt:

```
"Please greet me and introduce yourself briefly."
```

The AI responds in character because the system prompt (set during session configuration) defines the Hamilton persona. The greeting prompt simply triggers the AI to speak — the persona and tone come from the system instructions.

## Edge Cases

**Reconnection:** When the OpenAI client reconnects (after a network drop), `onConnected` fires again, which calls `triggerResponse()` again. With `aiSpeaksFirst: true`, this re-injects the greeting. This is acceptable because conversation history is lost on reconnect.

**skipTrigger option:** The `initializeVoiceClient` function accepts an optional `{ skipTrigger: true }` parameter that prevents `triggerResponse()` from being called. This is orthogonal to `aiSpeaksFirst` — `skipTrigger` controls whether any trigger happens, while `aiSpeaksFirst` controls what kind.

**Inactivity timer:** The inactivity timer starts when `startRecording()` is called. If the AI speaks first but the user never responds, the 20-second inactivity timer will fire and stop the interaction.

## Adding a New Voice Backend

To support `aiSpeaksFirst` in a new backend:

1. Implement the `VoiceClient` interface as usual
2. In your `triggerResponse()` method, check `this.config.aiSpeaksFirst`
3. When true, send a text message to the model using your backend's API to trigger an initial response
4. When false, use whatever default behavior your backend expects (e.g., no-op for VAD-based, or bare response trigger for manual-turn backends)

```typescript
triggerResponse(): void {
  if (this.config.aiSpeaksFirst && this.connected) {
    // Send a text prompt to trigger the AI to speak first
    this.session.sendMessage({
      role: "user",
      content: "Please greet me and introduce yourself briefly.",
    });
  }
}
```
