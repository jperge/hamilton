/**
 * Applies a simple low-pass FIR filter to prevent aliasing of audio.
 *
 * Uses a windowed sinc filter with a Hamming window.
 */
export function applyLowPassFilter(
  data: Int16Array,
  cutoffFreq: number,
  sampleRate: number
): Int16Array {
  const numberOfTaps = 31; // Should be odd
  const coefficients = new Float32Array(numberOfTaps);
  const fc = cutoffFreq / sampleRate;
  const middle = (numberOfTaps - 1) / 2;

  // Generate windowed sinc filter
  for (let i = 0; i < numberOfTaps; i++) {
    if (i === middle) {
      coefficients[i] = 2 * Math.PI * fc;
    } else {
      const x = 2 * Math.PI * fc * (i - middle);
      coefficients[i] = Math.sin(x) / (i - middle);
    }
    // Apply Hamming window
    coefficients[i] *=
      0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numberOfTaps - 1));
  }

  // Normalize coefficients
  const sum = coefficients.reduce((acc, val) => acc + val, 0);
  coefficients.forEach((_, i) => (coefficients[i] /= sum));

  // Apply filter
  const result = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < numberOfTaps; j++) {
      const idx = i - j + middle;
      if (idx >= 0 && idx < data.length) {
        sum += coefficients[j] * data[idx];
      }
    }
    result[i] = Math.round(sum);
  }

  return result;
}

/**
 * Downsamples audio data from one sample rate to another using linear interpolation
 * and anti-aliasing filter.
 *
 * @param audioData - Input audio data as Int16Array
 * @param inputSampleRate - Original sampling rate in Hz
 * @param outputSampleRate - Target sampling rate in Hz
 * @returns Downsampled audio data as Int16Array
 */
export function downsampleAudio(
  audioData: Int16Array,
  inputSampleRate: number,
  outputSampleRate: number
): Int16Array {
  if (inputSampleRate === outputSampleRate) {
    return audioData;
  }

  if (inputSampleRate < outputSampleRate) {
    throw new Error("Upsampling is not supported");
  }

  // Apply low-pass filter to prevent aliasing
  // Cut off at slightly less than the Nyquist frequency of the target sample rate
  const filteredData = applyLowPassFilter(
    audioData,
    outputSampleRate * 0.45, // Slight margin below Nyquist frequency
    inputSampleRate
  );

  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.floor(audioData.length / ratio);
  const result = new Int16Array(newLength);

  // Linear interpolation
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index + 1 < filteredData.length) {
      const a = filteredData[index];
      const b = filteredData[index + 1];
      result[i] = Math.round(a + fraction * (b - a));
    } else {
      result[i] = filteredData[index];
    }
  }

  return result;
}

/**
 * Convert a base64-encoded string to an Int16Array.
 * Used by Gemini Live API which sends/receives audio as base64 PCM16.
 */
export function base64ToInt16Array(base64: string): Int16Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

/**
 * Convert an Int16Array to a base64-encoded string.
 * Used by Gemini Live API which sends/receives audio as base64 PCM16.
 */
export function int16ArrayToBase64(audio: Int16Array): string {
  const uint8 = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}
