"use client";
import React, { use, useEffect, useState } from "react";
import SimliOpenAI from "./SimliOpenAI";
import DottedFace from "./Components/DottedFace";
import Image from "next/image";
import HamiltonImage from "./Components/HamiltonFront1.jpeg";
import fcatLogo from "./Components/fcat_logo.png";
import fintechLogo from "./Components/fintech_logo.png";
import fintechSandboxLogo from "./Components/fintech-sandbox-logo.png";
import moafLogo from "./Components/moaf-logo.png";

interface avatarSettings {
  name: string;
  openai_voice: "alloy"|"ash"|"ballad"|"coral"|"echo"|"sage"|"shimmer"|"verse";
  openai_model: string;
  simli_faceid: string;
  initialPrompt: string;
}

// Customize your avatar here
const avatar: avatarSettings = {
  name: "Alex",
  openai_voice: "ballad", //"ballad",
  openai_model: "gpt-realtime", //"gpt-4o-mini-realtime-preview-2024-12-17", // Use "gpt-4o-mini-realtime-preview-2024-12-17" for cheaper and faster responses
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
    <div className="bg-black min-h-screen flex flex-col items-start font-abc-repro font-normal text-sm text-white p-8">
      <div className="flex flex-col items-start gap-6 bg-effect15White p-6 pb-[40px] rounded-xl w-full ml-[50px] mt-[200px]">
        <div style={{ transform: "scale(2)", transformOrigin: "left center" }}>
          <div>
            {showDottedFace && <DottedFace />}
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
      {/* <div className="fixed bottom-4 right-4 text-white text-base bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        Questions? Contact Janos Perge
      </div> */}
      <div className="fixed top-4 right-4 bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        <Image
          src={fintechLogo}
          alt="Fintech Logo"
          width={240}
          height={60}
          unoptimized
        />
      </div>
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-5 bg-black/50 backdrop-blur-sm p-3 rounded-lg z-50 shadow-lg">
        <Image
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
        />
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
