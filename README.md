# Hamilton — Interactive AI Avatar

A real-time conversational AI avatar of Alexander Hamilton, powered by [Simli](https://www.simli.com/) for lip-synced video and your choice of **OpenAI Realtime** or **Google Gemini Live** for voice intelligence. Built with Next.js.

## Features

- **Dual voice backends** — Switch between OpenAI Realtime API and Google Gemini Live API
- **Lip-synced avatar** — Simli renders a photorealistic face that moves in sync with AI speech
- **Server-side VAD** — Both backends detect when you start/stop speaking automatically
- **Inactivity timeout** — Session ends after 20 seconds of silence to conserve API usage
- **Noise reduction** — OpenAI backend uses near-field noise reduction; Gemini uses low-sensitivity speech detection

## Prerequisites

- **Node.js v20** (v23 has compatibility issues with Next.js 14; use `nvm use 20`)
- **npm**
- API keys for:
  - [Simli](https://www.simli.com/profile)
  - [OpenAI](https://platform.openai.com/settings/profile?tab=api-keys) (for Realtime API)
  - [Google AI](https://aistudio.google.com/apikey) (for Gemini Live API)

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/jperge/hamilton
   cd hamilton
   ```

2. **Configure environment variables**

   Copy the sample env file and add your API keys:
   ```bash
   cp .env_sample .env
   ```

   Edit `.env`:
   ```
   NEXT_PUBLIC_SIMLI_API_KEY="your-simli-key"
   NEXT_PUBLIC_OPENAI_API_KEY="your-openai-key"
   NEXT_PUBLIC_GEMINI_API_KEY="your-gemini-key"
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Select a voice backend** using the toggle in the bottom-right corner (OpenAI or Gemini)
2. Click **Chat with Hamilton** to start the interaction
3. Speak into your microphone — Hamilton will respond in character
4. Click **Stop Interaction** to end the session

**Audio tips:**
- Use the device's built-in microphone (not Bluetooth)
- Select background noise mode in your OS microphone settings for better results in noisy environments

## Customization

Edit `app/page.tsx` to change the avatar, voice, or persona:

### Avatar face and persona
```js
const avatar = {
  name: "Alex",
  simli_faceid: "276ed3c6-36f0-44e2-8eef-6d04b9f473fc",
  initialPrompt: `Role: You are Alexander Hamilton...`,
};
```

Browse available faces in the [Simli docs](https://docs.simli.com/introduction) or [create your own](https://app.simli.com/).

### Voice backend defaults
```js
const BACKEND_DEFAULTS = {
  openai: { voiceModel: "gpt-realtime", voiceName: "ballad" },
  gemini: { voiceModel: "gemini-2.5-flash-native-audio-preview-12-2025", voiceName: "Orus" },
};
```

**OpenAI voices:** alloy, ash, ballad, coral, echo, sage, shimmer, verse

**Gemini voices:** Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr

## Architecture

The app uses a **VoiceClient abstraction** that lets OpenAI and Gemini be swapped transparently:

```
page.tsx (backend selection + state)
  └── SimliVoiceAvatar (session lifecycle, mic recording)
        ├── SimliClient (avatar rendering — unchanged per backend)
        └── VoiceClient (via factory)
              ├── OpenAIVoiceClient (24kHz input, RealtimeClient wrapper)
              └── GeminiVoiceClient (16kHz input, @google/genai live wrapper)
```

Key files:
| File | Purpose |
|------|---------|
| `app/voice/VoiceClient.ts` | Interface and types |
| `app/voice/OpenAIVoiceClient.ts` | OpenAI Realtime implementation |
| `app/voice/GeminiVoiceClient.ts` | Gemini Live implementation |
| `app/voice/createVoiceClient.ts` | Factory function |
| `app/voice/audioUtils.ts` | Shared audio processing (downsampling, format conversion) |
| `app/SimliVoiceAvatar.tsx` | Main avatar component |
| `app/page.tsx` | Page layout and backend selection |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `next dev` hangs or is very slow | Switch to Node.js v20: `nvm use 20` |
| `BatchedFileReader is not a constructor` | Reinstall dependencies: `rm -rf node_modules .next && npm install` |
| Avatar is silent (OpenAI) | Check `NEXT_PUBLIC_OPENAI_API_KEY` in `.env` |
| Avatar is silent (Gemini) | Check `NEXT_PUBLIC_GEMINI_API_KEY` in `.env` |
| Gemini connection drops after idle | The keepalive mechanism sends silent packets every 2s; if issues persist, check your network |
| Microphone not detected | Ensure browser has mic permissions and you're not using a Bluetooth audio device |
