/** Tiny WebAudio synth. No samples, so the page stays static and license-clean. */

export function createAudio() {
  const last = {
    shoot: 0,
    good: 0,
    bad: 0,
    hit: 0,
    base: 0,
    giant: 0,
    ready: 0,
    pick: 0,
    bomb: 0,
    freeze: 0,
  };
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.25);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") {
        const pending = ctx.resume();
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
      }
    } catch {
      ctx = null;
    }
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = value ? 0 : 0.22;
  }

  function tone(freq, dur, type, gain, to, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, freq), t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, gain, freq) {
    if (!ctx || muted || !noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function throttled(key, gap) {
    if (!ctx) return false;
    const now = ctx.currentTime;
    if (now - last[key] < gap) return false;
    last[key] = now;
    return true;
  }

  function flush(sfx) {
    if (!ctx || muted) return;
    try {
      flushNow(sfx);
    } catch {
      ctx = null;
    }
  }

  function flushNow(sfx) {
    if (sfx.shoot && throttled("shoot", 0.09)) {
      noise(0.03, 0.05, 400);
      tone(210, 0.04, "sine", 0.04, 140);
    }
    if (sfx.good && throttled("good", 0.07)) {
      tone(523, 0.07, "sine", 0.06, 660);
      tone(784, 0.09, "sine", 0.05, 988, 0.05);
    }
    if (sfx.bad && throttled("bad", 0.08)) {
      tone(196, 0.1, "square", 0.04, 90);
    }
    if (sfx.hit && throttled("hit", 0.045)) {
      noise(0.04, 0.05, 900);
    }
    if (sfx.base && throttled("base", 0.06)) {
      tone(92, 0.12, "sine", 0.08, 48);
      noise(0.08, 0.06, 200);
    }
    if (sfx.giant && throttled("giant", 0.12)) {
      tone(70, 0.22, "sawtooth", 0.05, 180);
      tone(140, 0.16, "square", 0.03, 60);
    }
    if (sfx.ready && throttled("ready", 0.1)) {
      tone(880, 0.07, "sine", 0.06, 1320);
    }
    if (sfx.pick && throttled("pick", 0.12)) {
      tone(660, 0.07, "sine", 0.06, 880);
      tone(990, 0.1, "triangle", 0.05, 1320, 0.06);
    }
    if (sfx.bomb && throttled("bomb", 0.1)) {
      noise(0.12, 0.08, 180);
      tone(90, 0.18, "sine", 0.08, 40);
    }
    if (sfx.freeze && throttled("freeze", 0.2)) {
      tone(1400, 0.12, "sine", 0.04, 700);
      tone(1800, 0.16, "triangle", 0.03, 900, 0.04);
    }
    if (sfx.win) {
      tone(523, 0.12, "sine", 0.07, 523, 0);
      tone(659, 0.12, "sine", 0.07, 659, 0.1);
      tone(784, 0.14, "sine", 0.07, 784, 0.2);
      tone(1046, 0.22, "sine", 0.06, 1046, 0.3);
    }
    if (sfx.lose) {
      tone(240, 0.45, "sawtooth", 0.05, 40);
      noise(0.3, 0.05, 300);
    }
  }

  return { unlock, flush, setMuted, get muted() { return muted; } };
}
