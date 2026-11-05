export const MUSIC = {
  src: "../music/T5.wav",
  segments: [
    { from: 0, beat: 1 },
    { from: 48, beat: 65 },
  ],
  tail: 1,
}

// T5's beats as measured by tools/beats.py: its stabs in the intro, its kicks after
const beats = [0.34, 0.802, 1.264, 1.726, 2.188, 2.65, 3.112, 3.574, 4.036, 4.498, 4.96, 5.422, 5.895, 6.356, 6.821, 7.282, 7.744, 8.208, 8.67, 9.134, 9.6, 10.064, 10.526, 10.99, 11.452, 11.914, 12.378, 12.84, 13.302, 13.764, 14.232, 14.694, 15.158, 15.62, 16.084, 16.546, 17.008, 17.47, 17.932, 18.394, 18.856, 19.318, 19.779, 20.241, 20.703, 21.165, 21.625, 22.087, 22.549, 23.011, 23.471, 23.933, 24.395, 24.857, 25.319, 25.781, 26.245, 26.707, 27.169, 27.631, 28.093, 28.555, 29.017, 29.479, 29.941, 30.399, 30.861, 31.321, 31.783, 32.243, 32.705, 33.167, 33.629, 34.09, 34.55, 35.012, 35.474, 35.884, 36.346, 36.808, 37.27, 37.732, 38.194, 38.656, 39.118, 39.58, 40.042, 40.5, 40.962, 41.424, 41.886, 42.348, 42.81, 43.272]

const beatTime = k => {
  const i = Math.min(Math.floor(k), beats.length - 2)
  return beats[i] + (beats[i + 1] - beats[i]) * (k - i)
}

let start = 0
for (const [i, s] of MUSIC.segments.entries()) {
  const prev = MUSIC.segments[i - 1]
  if (prev) start += beatTime(prev.beat + s.from - prev.from) - beatTime(prev.beat)
  s.start = start
  s.offset = beatTime(s.beat)
}

const segmentOf = v => MUSIC.segments.findLast(s => v >= s.from) ?? MUSIC.segments[0]

export const at = v => {
  const s = segmentOf(v)
  return s.start + beatTime(s.beat + v - s.from) - s.offset
}

export const spb = (beats.at(-1) - beats[0]) / (beats.length - 1)
