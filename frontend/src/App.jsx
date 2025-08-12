import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

// Simple component to render GLTF avatar
function Avatar({ visemeWeight, emotion }) {
  const gltf = useGLTF("/models/kuro_vrm.glb"); // you must provide a VRM/GLTF with morph targets
  const mesh = gltf.scene;
  // morph target names must match what you created:
  // e.g. "viseme_A", "viseme_E", "smile", "angry" etc.
  useEffect(() => {
    // apply emotion blendshapes from emotion state
    if (!mesh) return;
    mesh.traverse((child) => {
      if (child.morphTargetDictionary) {
        const dict = child.morphTargetDictionary;
        // Example: set "smile" or "angry"
        if (dict[emotion]) {
          child.morphTargetInfluences[dict[emotion]] = 1.0;
        }
        // apply viseme weights (an object mapping viseme->value)
        for (const [name, val] of Object.entries(visemeWeight || {})) {
          if (dict[name] !== undefined) {
            child.morphTargetInfluences[dict[name]] = val;
          }
        }
      }
    });
  }, [mesh, visemeWeight, emotion]);

  return <primitive object={mesh} />;
}

export default function App() {
  const [listening, setListening] = useState(false);
  const [emotion, setEmotion] = useState("neutral");
  const [visemeWeight, setVisemeWeight] = useState({});
  const audioRef = useRef(null);

  // record audio using MediaRecorder
  const recordAndSend = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    let chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "user.webm");
      const sttRes = await fetch("/api/stt", { method: "POST", body: form });
      const sttJson = await sttRes.json();
      // now call chat:
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: sttJson.text })
      });
      const chatJson = await chatRes.json();
      // chatJson expected: { text, emotion, ... }
      setEmotion(chatJson.emotion || "neutral");

      // request TTS:
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chatJson.text, voice_sample_path: "/voice/main_sample.wav" })
      });
      const ttsJson = await ttsRes.json();
      const audioBase64 = ttsJson.audioBase64;
      const visemes = ttsJson.visemes || [];

      // set up audio element
      const audioBlob = b64toBlob(audioBase64, "audio/wav");
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // schedule viseme updates along playback
      audio.onplay = () => scheduleVisemes(visemes, setVisemeWeight, audio);
      audio.play();
    };
    mediaRecorder.start();
    setListening(true);
    // record 3 seconds for demo
    setTimeout(() => {
      mediaRecorder.stop();
      setListening(false);
    }, 3000);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Canvas style={{ flex: 1 }}>
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Avatar visemeWeight={visemeWeight} emotion={emotion} />
        <OrbitControls />
      </Canvas>
      <div style={{ width: 360, padding: 12 }}>
        <button onClick={recordAndSend}>{listening ? "Recording..." : "Talk"}</button>
        <p>Emotion: {emotion}</p>
        <div>
          <label>Personality (quick):</label>
          {/* UI to update system prompt via backend */}
        </div>
      </div>
    </div>
  );
}

// helper: schedule visemes during playback
function scheduleVisemes(visemes, setVisemeWeight, audio) {
  // visemes = [{phoneme:'aa', start:0.12, end:0.18}, ...]
  // map phonemes to morph target names; simple mapping example:
  const mapping = {
    "AA": "viseme_A",
    "AE": "viseme_A",
    "AH": "viseme_A",
    "AO": "viseme_O",
    "EE": "viseme_E",
    "IY": "viseme_E",
    "M": "viseme_M", // closed mouth
  };

  const startTime = audio.currentTime;
  // clear previous timers
  visemes.forEach(v => {
    const startMs = Math.max(0, (v.start - startTime)) * 1000;
    const endMs = Math.max(0, (v.end - startTime)) * 1000;
    // schedule set to 1 at start, 0 at end
    setTimeout(() => {
      const name = mapping[v.phoneme.toUpperCase()] || "viseme_A";
      setVisemeWeight(prev => ({ ...prev, [name]: 1 }));
    }, startMs);
    setTimeout(() => {
      const name = mapping[v.phoneme.toUpperCase()] || "viseme_A";
      setVisemeWeight(prev => ({ ...prev, [name]: 0 }));
    }, endMs);
  });
}

function b64toBlob(b64Data, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}
