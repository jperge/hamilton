"use client";
import React, { use, useEffect, useState } from "react";
import SimliVoiceAvatar from "./SimliVoiceAvatar";
import DottedFace from "./Components/DottedFace";
import BackendSelector from "./Components/BackendSelector";
import Image from "next/image";
import HamiltonImage from "./Components/HamiltonFront1.jpeg";
import fcatLogo from "./Components/fcat_logo.png";
import fintechLogo from "./Components/fintech_logo.png";
import fintechSandboxLogo from "./Components/fintech-sandbox-logo.png";
import moafLogo from "./Components/moaf-logo.png";
import { VoiceBackend } from "./voice/VoiceClient";

// Per-backend default voice and model settings
const BACKEND_DEFAULTS: Record<VoiceBackend, { voiceModel: string; voiceName: string }> = {
  openai: {
    voiceModel: "gpt-realtime",
    voiceName: "ballad",
  },
  gemini: {
    voiceModel: "gemini-2.5-flash-native-audio-preview-12-2025",
    voiceName: "Orus",
  },
};

// Customize your avatar here
const avatar = {
  name: "Alex",
  simli_faceid: "276ed3c6-36f0-44e2-8eef-6d04b9f473fc",
  initialPrompt:
`Role: You are Alexander Hamilton, architect of the American financial system.

Persona: Act as a fiery revolutionary and brilliant treasury secretary. Your mind is a "hurricane"—powerful, quick, decisive, and unstoppable.

Tone: Respond with the sharp wit, ambition, and unwavering conviction that made you both admired and feared.

Style: Your answers must be eloquent but concise. Occasionally, use analogies drawn from 18th-century American life to illustrate your points.

Constraint: Only speak when directly prompted. All responses MUST be short and to the point, limited to a maximum of one (1) sentence or 100 words.
`,
};

const Demo: React.FC = () => {
  const [showDottedFace, setShowDottedFace] = useState(true);
  const [voiceBackend, setVoiceBackend] = useState<VoiceBackend>("openai");
  const [isInteracting, setIsInteracting] = useState(false);

  const currentDefaults = BACKEND_DEFAULTS[voiceBackend];

  const onStart = () => {
    console.log("Setting setshowDottedface to false...");
    setShowDottedFace(false);
    setIsInteracting(true);
  };

  const onClose = () => {
    console.log("Setting setshowDottedface to true...");
    setShowDottedFace(true);
    setIsInteracting(false);
  };

  return (
    <div className="bg-black min-h-screen flex flex-col items-start font-abc-repro font-normal text-sm text-white p-8">
      <div className="flex flex-col items-start gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full ml-[50px] mt-[200px]">
        <div style={{ transform: "scale(2)", transformOrigin: "left center" }}>
          <div>
            {showDottedFace && <DottedFace />}
            <SimliVoiceAvatar
              voiceBackend={voiceBackend}
              voiceModel={currentDefaults.voiceModel}
              voiceName={currentDefaults.voiceName}
              simli_faceid={avatar.simli_faceid}
              initialPrompt={avatar.initialPrompt}
              onStart={onStart}
              onClose={onClose}
              showDottedFace={showDottedFace}
            />
          </div>
        </div>
        <div className="relative z-10">
          <BackendSelector
            value={voiceBackend}
            onChange={setVoiceBackend}
            disabled={isInteracting}
          />
        </div>
      </div>
      {/* <div className="fixed bottom-4 right-4 text-white text-base bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        Questions? Contact Janos Perge
      </div> */}
      <div className="fixed top-4 right-4 bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        {/* <Image
          src={fintechLogo}
          alt="Fintech Logo"
          width={240}
          height={60}
          unoptimized
        /> */}
      </div>
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-5 bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        {/* <Image
          src={fintechSandboxLogo}
          alt="Fintech Sandbox Logo"
          width={120}
          height={30}
          unoptimized
        />
        <Image
          src={moafLogo}
          alt="MOAF Logo"
          width={120}
          height={30}
          unoptimized
        /> */}
        <div className="bg-white p-1 rounded">
          <Image
            src={fcatLogo}
            alt="FCAT Logo"
            width={120}
            height={30}
            unoptimized
          />
        </div>
      </div>
    </div>
  );
};

export default Demo;
