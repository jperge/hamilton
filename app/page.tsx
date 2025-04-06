"use client";
import React, { useState } from "react";
import SimliOpenAI from "./SimliOpenAI";

interface avatarSettings {
name: string;
openai_voice: "alloy"|"ash"|"ballad"|"coral"|"echo"|"sage"|"shimmer"|"verse";
openai_model: string;
simli_faceid: string;
initialPrompt: string;
}

// Customize your avatar here
const avatar: avatarSettings = {
name: "Frank",
openai_voice: "ballad",
openai_model: "gpt-4o-mini-realtime-preview-2024-12-17", // Use "gpt-4o-mini-realtime-preview-2024-12-17" for cheaper and faster responses
simli_faceid: "0c2b8b04-5274-41f1-a21c-d5c98322efa9",
initialPrompt:
  "You are the historical figure Alexander Hamilton. You are friendly and concise in your responses. Your task is to help users with any questions they might have about you or on American history of the 18th century. Your answers are short and to the point, don't give long answers be brief and straightforward.",
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
  <div className="bg-black min-h-screen flex flex-col items-center font-abc-repro font-normal text-sm text-white p-8">
    <div className="flex flex-col items-center gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full">
      <div>
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