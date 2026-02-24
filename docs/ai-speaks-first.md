# AI Speaks First

## Overview

By default, voice conversations require the human to speak first. The **AI Speaks First** feature lets the AI avatar initiate the conversation with a spoken greeting, creating a more natural experience where Hamilton introduces himself when the user clicks "Chat with Hamilton."

The feature is implemented for both voice backends:

- **OpenAI Realtime API** -- injects a hidden user message via `sendUserMessageContent()`, which triggers the model to generate a spoken response.
- **Gemini Live API** -- sends a text turn via `sendClientContent()` with `turnComplete: true`, prompting the model to respond immediately.

A UI checkbox ("Hamilton speaks first") lets the user toggle this behavior before starting a session.

## Architecture

```
page.tsx                         UI state: aiSpeaksFirst (default: true)
  |                              Checkbox toggle, disabled during interaction
  v
SimliVoiceAvatar.tsx             Receives aiSpeaksFirst as prop
  |                              Passes it into VoiceClientConfig
  v
createVoiceClient()              Factory selects backend based on voiceBackend
  |                              Passes full config including aiSpeaksFirst
  v
OpenAIVoiceClient                GeminiVoiceClient
  |                                |
  v                                v
triggerResponse()                triggerResponse()
  |                                |
  |  if aiSpeaksFirst:             |  if aiSpeaksFirst:
  |  sendUserMessageContent()      |  sendClientContent()
  |  (injects user msg +           |  (sends user turn +
  |   calls createResponse)        |   turnComplete: true)
  |                                |
  |  else:                         |  else:
  |  createResponse()              |  no-op (VAD handles it)
  v                                v
AI generates spoken greeting     AI generates spoken greeting
```

### Trigger Point

After the voice client connects, the `onConnected` callback in `SimliVoiceAvatar.tsx` calls `triggerResponse()`:

```typescript
// app/SimliVoiceAvatar.tsx (onConnected callback)
onConnected: () => {
  console.log("Voice client connected");
  isVoiceConnectedRef.current = true;
  if (!options?.skipTrigger) {
    voiceClientRef.current?.triggerResponse();
  }
  startRecording();
},
```

Each backend's `triggerResponse()` checks `this.config.aiSpeaksFirst` to decide its behavior.

## Configuration

The feature is controlled by a single optional field on `VoiceClientConfig`:

```typescript
// app/voice/VoiceClient.ts
export interface VoiceClientConfig {
  apiKey: string;
  model: string;
  voice: string;
  systemPrompt: string;
  /** When true, the AI will speak first with a greeting. Default: false */
  aiSpeaksFirst?: boolean;
}
```

No changes to the `VoiceClient` interface were needed. The existing `triggerResponse(): void` method serves as the hook point -- each backend decides what to do based on the config.

## Backend Implementations

### OpenAI Realtime API

The OpenAI SDK's `RealtimeClient` provides `sendUserMessageContent()`, which:
1. Creates a `conversation.item.create` event with a user message
2. Automatically calls `createResponse()` to trigger the AI to respond

```typescript
// app/voice/OpenAIVoiceClient.ts
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
```

**How `sendUserMessageContent` works internally** (from `@openai/realtime-api-beta`):

```javascript
// node_modules/@openai/realtime-api-beta/lib/client.js
sendUserMessageContent(content = []) {
  if (content.length) {
    for (const c of content) {
      if (c.type === 'input_audio') {
        if (c.audio instanceof ArrayBuffer || c.audio instanceof Int16Array) {
          c.audio = RealtimeUtils.arrayBufferToBase64(c.audio);
        }
      }
    }
    this.realtime.send('conversation.item.create', {
      item: {
        type: 'message',
        role: 'user',
        content,
      },
    });
  }
  this.createResponse();
  return true;
}
```

### Gemini Live API

The Gemini SDK's live session provides `sendClientContent()`, which sends a structured text turn to the model. Setting `turnComplete: true` tells the server to start generating a response immediately.

```typescript
// app/voice/GeminiVoiceClient.ts
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
  // When aiSpeaksFirst is false, remain a no-op -- Gemini responds via VAD.
}
```

**Key difference from OpenAI:** Gemini Live uses Voice Activity Detection (VAD) to automatically trigger responses when the user finishes speaking. There is no `createResponse()` equivalent. When `aiSpeaksFirst` is false, `triggerResponse()` is a no-op.

## UI Integration

The toggle lives in `app/page.tsx` as React state, passed down as a prop:

```typescript
// app/page.tsx
const [aiSpeaksFirst, setAiSpeaksFirst] = useState(true);
```

The checkbox is rendered in the bottom-right settings panel alongside the backend selector. It is disabled during an active interaction to prevent mid-conversation changes:

```tsx
// app/page.tsx
<label
  className={`flex items-center gap-2 text-xs font-abc-repro-mono text-white ${
    isInteracting ? "opacity-50 pointer-events-none" : "cursor-pointer"
  }`}
>
  <input
    type="checkbox"
    checked={aiSpeaksFirst}
    onChange={(e) => setAiSpeaksFirst(e.target.checked)}
    disabled={isInteracting}
  />
  Hamilton speaks first
</label>
```

The prop is passed to the avatar component:

```tsx
<SimliVoiceAvatar
  voiceBackend={voiceBackend}
  voiceModel={currentDefaults.voiceModel}
  voiceName={currentDefaults.voiceName}
  simli_faceid={avatar.simli_faceid}
  initialPrompt={avatar.initialPrompt}
  aiSpeaksFirst={aiSpeaksFirst}
  onStart={onStart}
  onClose={onClose}
  showDottedFace={showDottedFace}
/>
```

## Component Wiring

`SimliVoiceAvatar` receives `aiSpeaksFirst` as a prop and includes it in the `VoiceClientConfig` passed to the factory:

```typescript
// app/SimliVoiceAvatar.tsx
interface SimliVoiceAvatarProps {
  simli_faceid: string;
  voiceBackend: VoiceBackend;
  voiceModel: string;
  voiceName: string;
  initialPrompt: string;
  aiSpeaksFirst: boolean;
  onStart: () => void;
  onClose: () => void;
  showDottedFace: boolean;
}
```

Inside `initializeVoiceClient`, the config is assembled and passed to the factory:

```typescript
// app/SimliVoiceAvatar.tsx
voiceClientRef.current = createVoiceClient(voiceBackend, {
  apiKey,
  model: voiceModel,
  voice: voiceName,
  systemPrompt: initialPrompt,
  aiSpeaksFirst,
}, {
  // ...callbacks
});
```

The factory (`app/voice/createVoiceClient.ts`) passes the full config to whichever backend is selected:

```typescript
// app/voice/createVoiceClient.ts
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
```

## Adding a New Backend

To support `aiSpeaksFirst` in a new voice backend:

1. Implement the `VoiceClient` interface (which includes `triggerResponse()`)
2. In your `triggerResponse()` method, check `this.config.aiSpeaksFirst`
3. When true, use whatever mechanism your backend provides to inject an initial text message and trigger the model to respond
4. When false, implement the default behavior (manual trigger or no-op depending on the backend's turn-taking model)

Example skeleton:

```typescript
export class MyVoiceClient implements VoiceClient {
  private config: VoiceClientConfig;

  constructor(config: VoiceClientConfig, callbacks: VoiceClientCallbacks) {
    this.config = config;
    // ...
  }

  triggerResponse(): void {
    if (this.config.aiSpeaksFirst) {
      // Send a text message to the model to trigger a greeting
      this.session.sendMessage({
        role: "user",
        text: "Please greet me and introduce yourself briefly.",
      });
    }
    // else: default behavior for this backend
  }

  // ...other VoiceClient methods
}
```

Then register it in the factory (`app/voice/createVoiceClient.ts`):

```typescript
case "my-backend":
  return new MyVoiceClient(config, callbacks);
```

## Edge Cases

### Reconnection

When `OpenAIVoiceClient.attemptReconnect()` succeeds, it calls `connect()` again, which fires `onConnected`, which calls `triggerResponse()`. With `aiSpeaksFirst: true`, this re-injects a greeting. This is acceptable since conversation history is lost on reconnect.

### The `skipTrigger` Option

The `onConnected` callback checks `options?.skipTrigger` before calling `triggerResponse()`. This is orthogonal to `aiSpeaksFirst` -- `skipTrigger` controls whether any trigger happens at all, while `aiSpeaksFirst` controls what kind of trigger happens.

### Inactivity Timer

The inactivity timer starts when `startRecording()` is called (after connection). If the AI speaks first but the user never responds, the 20-second inactivity timer will fire and stop the interaction. The AI's audio response does not reset the timer -- only user microphone activity does.

### Injected Message Visibility

The injected greeting prompt ("Please greet me and introduce yourself briefly.") is a hidden text message. For OpenAI, it uses `type: "input_text"` with a `text` field, while `onUserTranscript` reads from `content[0].transcript` -- so the injected message does not appear in the UI's user message display. For Gemini, the `sendClientContent` message is separate from the `inputTranscription` events that populate the user transcript.

## Files Reference

| File | Role |
|------|------|
| `app/voice/VoiceClient.ts` | `VoiceClientConfig.aiSpeaksFirst` field definition |
| `app/voice/OpenAIVoiceClient.ts` | OpenAI `triggerResponse()` implementation |
| `app/voice/GeminiVoiceClient.ts` | Gemini `triggerResponse()` implementation |
| `app/voice/createVoiceClient.ts` | Factory -- passes config to backends |
| `app/SimliVoiceAvatar.tsx` | Props interface, config assembly, `onConnected` trigger |
| `app/page.tsx` | UI state, checkbox toggle, prop passing |
