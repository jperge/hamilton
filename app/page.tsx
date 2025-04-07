"use client";
import React, { useState } from "react";
import SimliOpenAI from "./SimliOpenAI";

interface avatarSettings {
  name: string;
  openai_voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
  openai_model: string;
  simli_faceid: string;
  initialPrompt: string;
}

// Customize your avatar here
const avatar: avatarSettings = {
  name: "Alex",
  openai_voice: "ballad", //"ballad",
  openai_model: "gpt-4o-mini-realtime-preview-2024-12-17", // Use "gpt-4o-mini-realtime-preview-2024-12-17" for cheaper and faster responses
  simli_faceid: "276ed3c6-36f0-44e2-8eef-6d04b9f473fc",
  initialPrompt:
    "You are Alexander Hamilton, the fiery revolutionary and brilliant treasury secretary who helped forge America's financial system. Respond with the sharp wit and eloquence that made you both admired and feared. Your mind works like a hurricane - powerful, quick, and unstoppable. Though concise, inject your responses with your trademark ambition and unwavering conviction. Occasionally use analogies drawn from 18th century American life to illustrate your points. Your answers are short and to the point, don't give long answers be brief and straightforward.",
};

const Demo: React.FC = () => {
  const [showDottedFace, setShowDottedFace] = useState(true);

  const onStart = () => {
    console.log("Setting setshowDottedface to false...");
    setShowDottedFace(false);
  };

  const onClose = () => {
    console.log("Setting setshowDottedface to true...");
    setShowDottedFace(true);
  };

  return (
    <div className="bg-black min-h-screen flex flex-col items-start font-abc-repro font-normal text-sm text-white p-8"> {/* Changed items-center to items-start */}
      <div className="flex flex-col items-start gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full ml-[50px] mt-[200px]"> {/* Added ml-[100px] and changed items-center to items-start */}
        <div style={{ transform: "scale(2)", transformOrigin: "left center" }}> {/* Changed transformOrigin to left center */}
          <SimliOpenAI
            openai_voice={avatar.openai_voice}
            openai_model={avatar.openai_model}
            simli_faceid={avatar.simli_faceid}
            initialPrompt={avatar.initialPrompt}
            onStart={onStart}
            onClose={onClose}
            showDottedFace={showDottedFace}
          />
        </div>
      </div>
    </div>
  );
};

export default Demo;