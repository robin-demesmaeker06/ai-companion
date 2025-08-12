// map a word or phoneme-like token to a viseme morph target name
export function mapWordToViseme(word) {
  const w = (word || "").toLowerCase();
  // Very simple heuristics:
  if (!w) return "viseme_A";
  if (/[mbp]/.test(w[0])) return "viseme_M"; // closed mouth sounds often start with m/p/b
  if (/[aeiou]/.test(w[0])) return "viseme_A"; // vowels -> open shapes
  if (w.length <= 3) return "viseme_O";
  return "viseme_E";
}

export function scheduleVisemes(visemes, audio, applyViseme) {
  const startTime = audio.currentTime || 0;
  // Clear previously scheduled timers? For demo we skip clearing.
  visemes.forEach(fragment => {
    const s = Math.max(0, (fragment.start - startTime) * 1000);
    const e = Math.max(0, (fragment.end - startTime) * 1000);
    const visemeName = mapWordToViseme(fragment.phoneme || fragment.word || fragment.phrase);
    setTimeout(() => applyViseme(visemeName, 1), s);
    setTimeout(() => applyViseme(visemeName, 0), e);
  });
}
