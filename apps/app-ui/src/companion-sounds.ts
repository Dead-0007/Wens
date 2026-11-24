/**
 * Companion Procedural Audio Engine
 * Lightweight, zero-dependency, zero-latency Web Audio API sound synthesizers
 * for Wens companions. Respects user preferences and quiet hours.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export type CompanionSoundAction = 'tap' | 'celebration' | 'prayer' | 'focus' | 'select' | 'review';

export interface PlaySoundOptions {
  volume?: number;
  enabled?: boolean;
}

export function playCompanionSound(
  avatar: string = 'orb',
  action: CompanionSoundAction = 'tap',
  options: PlaySoundOptions = {}
): void {
  if (options.enabled === false) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const baseVolume = (options.volume ?? 0.35) * 0.4;
  const now = ctx.currentTime;

  try {
    switch (avatar) {
      case 'robot':
        playRobotSound(ctx, action, now, baseVolume);
        break;
      case 'cat':
        playCatSound(ctx, action, now, baseVolume);
        break;
      case 'owl':
        playOwlSound(ctx, action, now, baseVolume);
        break;
      case 'crescent':
        playCrescentSound(ctx, action, now, baseVolume);
        break;
      case 'sprout':
        playSproutSound(ctx, action, now, baseVolume);
        break;
      case 'lantern':
        playLanternSound(ctx, action, now, baseVolume);
        break;
      case 'orb':
      default:
        playOrbSound(ctx, action, now, baseVolume);
        break;
    }
  } catch {
    // Gracefully ignore audio synthesis errors
  }
}

// 1. Orb: Soft pure harmonic singing-bowl resonance
function playOrbSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  const freq = action === 'celebration' ? 659.25 : action === 'focus' ? 440 : 528;
  osc.frequency.setValueAtTime(freq, now);
  if (action === 'celebration') {
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
  }

  gain.gain.setValueAtTime(vol * 0.9, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (action === 'celebration' ? 0.7 : 0.45));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + (action === 'celebration' ? 0.75 : 0.5));
}

// 2. Robot: Cute friendly electronic chirp / arpeggio
function playRobotSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';

  if (action === 'celebration') {
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880.0, now + 0.08);
    osc.frequency.setValueAtTime(1174.66, now + 0.16);
    gain.gain.setValueAtTime(vol * 0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  } else {
    osc.frequency.setValueAtTime(action === 'focus' ? 660 : 440, now);
    osc.frequency.exponentialRampToValueAtTime(action === 'focus' ? 880 : 660, now + 0.08);
    gain.gain.setValueAtTime(vol * 0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + (action === 'celebration' ? 0.45 : 0.25));
}

// 3. Cat: Gentle purr / cheerful meow chirp
function playCatSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  if (action === 'celebration') {
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);
    gain.gain.setValueAtTime(vol * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  } else {
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);
    gain.gain.setValueAtTime(vol * 0.75, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.45);
}

// 4. Owl: Wise two-tone gentle hoot
function playOwlSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  osc.frequency.setValueAtTime(370, now);
  osc.frequency.exponentialRampToValueAtTime(310, now + 0.18);
  if (action === 'celebration') {
    osc.frequency.setValueAtTime(440, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(370, now + 0.4);
  }

  gain.gain.setValueAtTime(vol * 0.85, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (action === 'celebration' ? 0.5 : 0.3));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + (action === 'celebration' ? 0.55 : 0.35));
}

// 5. Crescent: Crystalline celestial chime
function playCrescentSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  const freq = action === 'celebration' ? 1318.51 : 1046.5;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.15);

  gain.gain.setValueAtTime(vol * 0.65, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.65);
}

// 6. Sprout: Crisp resonant organic pluck / droplet
function playSproutSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  osc.frequency.setValueAtTime(action === 'celebration' ? 880 : 587.33, now);
  osc.frequency.exponentialRampToValueAtTime(action === 'celebration' ? 1174.66 : 783.99, now + 0.08);

  gain.gain.setValueAtTime(vol * 0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
}

// 7. Lantern: Warm bell/hearth chime
function playLanternSound(ctx: AudioContext, action: CompanionSoundAction, now: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';

  const freq = action === 'celebration' ? 784 : 523.25;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(vol * 0.75, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (action === 'celebration' ? 0.65 : 0.4));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + (action === 'celebration' ? 0.7 : 0.45));
}
