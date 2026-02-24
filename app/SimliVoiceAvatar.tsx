import React, { useCallback, useEffect, useRef, useState } from "react";
import { SimliClient } from "simli-client";
import VideoBox from "./Components/VideoBox";
import cn from "./utils/TailwindMergeAndClsx";
import IconSparkleLoader from "@/media/IconSparkleLoader";
import { VoiceBackend, VoiceClient } from "./voice/VoiceClient";
import { createVoiceClient } from "./voice/createVoiceClient";

const INACTIVITY_DURATION = 20000;

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

const simliClient = new SimliClient();

const SimliVoiceAvatar: React.FC<SimliVoiceAvatarProps> = ({
  simli_faceid,
  voiceBackend,
  voiceModel,
  voiceName,
  initialPrompt,
  aiSpeaksFirst,
  onStart,
  onClose,
  showDottedFace,
}) => {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(false);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [userMessage, setUserMessage] = useState("...");

  // Refs for various components and states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Audio chunk queue for Simli
  const audioChunkQueueRef = useRef<Int16Array[]>([]);
  const isProcessingChunkRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isVoiceConnectedRef = useRef(false);

  // Ref to break dependency: initializeVoiceClient needs startRecording,
  // but we define startRecording first. We use a ref for the voice client
  // initialization to avoid circular hook dependencies.
  const initializeVoiceClientRef = useRef<(options?: { skipTrigger?: boolean }) => Promise<void>>(async () => {});

  /**
   * Stops audio recording from the user's microphone
   */
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setIsRecording(false);
    console.log("Audio recording stopped");
  }, []);

  /**
   * Initializes the Simli client with the provided configuration.
   */
  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
        faceID: simli_faceid,
        handleSilence: true,
        maxSessionLength: 6000,
        maxIdleTime: 600,
        videoRef: videoRef.current,
        audioRef: audioRef.current,
        enableConsoleLogs: true,
      };

      simliClient.Initialize(SimliConfig as any);
      console.log("Simli Client initialized");
    }
  }, [simli_faceid]);

  /**
   * Processes the next audio chunk in the queue, sending it to Simli.
   */
  const processNextAudioChunk = useCallback(() => {
    if (
      audioChunkQueueRef.current.length > 0 &&
      !isProcessingChunkRef.current
    ) {
      isProcessingChunkRef.current = true;
      const audioChunk = audioChunkQueueRef.current.shift();
      if (audioChunk) {
        const chunkDurationMs = (audioChunk.length / 16000) * 1000;
        simliClient?.sendAudioData(audioChunk as any);
        console.log(
          "Sent audio chunk to Simli:",
          chunkDurationMs,
          "Duration:",
          chunkDurationMs.toFixed(2),
          "ms"
        );
        isProcessingChunkRef.current = false;
        processNextAudioChunk();
      }
    }
  }, []);

  /**
   * Handles stopping the interaction, cleaning up resources and resetting states.
   */
  const handleStop = useCallback(() => {
    console.log("Stopping interaction...");
    setIsLoading(false);
    setError("");
    stopRecording();
    setIsAvatarVisible(false);
    isVoiceConnectedRef.current = false;
    simliClient?.close();
    try {
      voiceClientRef.current?.disconnect();
    } catch (error: any) {
      console.warn("Error disconnecting voice client:", error);
    }
    voiceClientRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    onClose();
    console.log("Interaction stopped");
  }, [stopRecording, onClose]);

  /**
   * Resets the inactivity timer, stopping the interaction after a period of inactivity.
   */
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      console.log("Inactivity detected - stopping interaction.");
      handleStop();
    }, INACTIVITY_DURATION);
  }, [handleStop]);

  /**
   * Starts audio recording from the user's microphone.
   * Uses the voiceClient's inputSampleRate to configure the AudioContext.
   */
  const startRecording = useCallback(async () => {
    const sampleRate = voiceClientRef.current?.inputSampleRate || 24000;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });
    }

    try {
      console.log(`Starting audio recording at ${sampleRate}Hz...`);
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const source = audioContextRef.current.createMediaStreamSource(
        streamRef.current
      );
      processorRef.current = audioContextRef.current.createScriptProcessor(
        2048,
        1,
        1
      );

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Int16Array(inputData.length);
        let sum = 0;

        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          audioData[i] = Math.floor(sample * 32767);
          sum += Math.abs(sample);
        }

        // Reset inactivity timer if audio activity is detected
        const avg = sum / inputData.length;
        if (avg > 0.01) {
          resetInactivityTimer();
        }

        // Send audio to the voice backend
        if (isVoiceConnectedRef.current && voiceClientRef.current) {
          voiceClientRef.current.sendAudio(audioData);
        }
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      setIsRecording(true);
      resetInactivityTimer();
      console.log("Audio recording started");
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Error accessing microphone. Please check your permissions.");
    }
  }, [resetInactivityTimer]);

  /**
   * Initializes the voice client (OpenAI or Gemini) and connects to the API.
   */
  const initializeVoiceClient = useCallback(
    async (options?: { skipTrigger?: boolean }) => {
      const apiKey =
        voiceBackend === "openai"
          ? process.env.NEXT_PUBLIC_OPENAI_API_KEY!
          : process.env.NEXT_PUBLIC_GEMINI_API_KEY!;

      voiceClientRef.current = createVoiceClient(voiceBackend, {
        apiKey,
        model: voiceModel,
        voice: voiceName,
        systemPrompt: initialPrompt,
        aiSpeaksFirst,
      }, {
        onAudioData: (audio: Int16Array) => {
          audioChunkQueueRef.current.push(audio);
          if (!isProcessingChunkRef.current) {
            processNextAudioChunk();
          }
        },
        onUserTranscript: (transcript: string) => {
          setUserMessage(transcript);
        },
        onInterruption: () => {
          console.warn("Conversation interrupted");
          simliClient?.ClearBuffer();
          audioChunkQueueRef.current.length = 0;
          isProcessingChunkRef.current = false;
        },
        onConnected: () => {
          console.log("Voice client connected");
          isVoiceConnectedRef.current = true;
          if (!options?.skipTrigger) {
            voiceClientRef.current?.triggerResponse();
          }
          startRecording();
        },
        onError: (errorMsg: string) => {
          console.error("Voice client error:", errorMsg);
          isVoiceConnectedRef.current = false;
          setError(errorMsg);
        },
        onDisconnected: () => {
          console.log("Voice client disconnected");
          isVoiceConnectedRef.current = false;
        },
      });

      await voiceClientRef.current.connect();
      setIsAvatarVisible(true);
    },
    [voiceBackend, voiceModel, voiceName, initialPrompt, aiSpeaksFirst, processNextAudioChunk, startRecording]
  );

  // Keep ref in sync with latest callback
  useEffect(() => {
    initializeVoiceClientRef.current = initializeVoiceClient;
  }, [initializeVoiceClient]);

  // When component unmounts, ensure cleanup
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      try {
        voiceClientRef.current?.disconnect();
      } catch (e) {}
      simliClient?.close();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handles the start of the interaction, initializing clients and starting recording.
   */
  const handleStart = useCallback(async () => {
    setIsLoading(true);
    setError("");
    onStart();

    try {
      console.log("Starting...");
      initializeSimliClient();
      await simliClient?.start();
      eventListenerSimli();
    } catch (error: any) {
      console.error("Error starting interaction:", error);
      setError(`Error starting interaction: ${error.message}`);
    } finally {
      setIsAvatarVisible(true);
      setIsLoading(false);
    }
  }, [onStart, initializeSimliClient]);

  /**
   * Simli Event listeners
   */
  const eventListenerSimli = useCallback(() => {
    if (simliClient) {
      simliClient?.on("connected", () => {
        console.log("SimliClient connected");
        // Initialize the voice client (OpenAI or Gemini)
        initializeVoiceClientRef.current();
      });

      simliClient?.on("disconnected", () => {
        console.log("SimliClient disconnected");
        isVoiceConnectedRef.current = false;
        try {
          voiceClientRef.current?.disconnect();
        } catch (error: any) {
          console.warn("Error disconnecting voice client:", error);
        }
        if (audioContextRef.current) {
          audioContextRef.current?.close();
        }
      });
    }
  }, []);

  return (
    <>
      <div
        className={`transition-all duration-300 ${
          showDottedFace ? "h-0 overflow-hidden" : "h-auto"
        }`}
      >
        <VideoBox video={videoRef} audio={audioRef} />
      </div>
      <div className="flex flex-col items-center">
        {!isAvatarVisible ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className={cn(
              "h-[32px] mt-4 disabled:bg-[#343434] disabled:text-white disabled:hover:rounded-[100px] bg-simliblue text-white py-1 px-6 rounded-[100px] transition-all duration-300 hover:text-black hover:bg-white hover:rounded-sm",
              "flex justify-center items-center"
            )}
          >
            {isLoading ? (
              <IconSparkleLoader className="h-[16px] animate-loader" />
            ) : (
              <span className="font-abc-repro-mono font-bold text-xs whitespace-nowrap">
                Chat with Hamilton
              </span>
            )}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={handleStop}
                className={cn(
                  "mt-4 group text-white flex-grow bg-red hover:rounded-sm hover:bg-white h-[32px] px-3 rounded-[100px] transition-all duration-300"
                )}
              >
                <span className="font-abc-repro-mono group-hover:text-black font-bold w-[100px] text-xs transition-all duration-300">
                  Stop Interaction
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default SimliVoiceAvatar;
