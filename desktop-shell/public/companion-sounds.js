/**
 * Companion Procedural Audio Engine (Floating Window)
 * Lightweight Web Audio API synthesizers for Wens companions.
 */
(function(global) {
  let audioCtx = null;

  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
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

  function playCompanionSound(avatar = 'orb', action = 'tap', options = {}) {
    if (options.enabled === false) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const runSynthesis = () => {
      const rawVol = Number(options.volume);
      const safeVol = Number.isFinite(rawVol) ? Math.max(0, Math.min(1, rawVol)) : 0.35;
      const vol = safeVol * 0.4;
      const now = ctx.currentTime;

      try {
        if (action === 'alert' || action === 'reminder') {
          const o1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          o1.type = 'sine';
          o1.frequency.setValueAtTime(587.33, now);
          o1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
          g1.gain.setValueAtTime(vol * 0.85, now);
          g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
          o1.connect(g1);
          g1.connect(ctx.destination);
          o1.start(now);
          o1.stop(now + 0.6);

          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = 'sine';
          o2.frequency.setValueAtTime(880, now + 0.14);
          o2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.32);
          g2.gain.setValueAtTime(0.0001, now);
          g2.gain.setValueAtTime(vol * 0.9, now + 0.14);
          g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
          o2.connect(g2);
          g2.connect(ctx.destination);
          o2.start(now + 0.14);
          o2.stop(now + 0.8);
          return;
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        switch (avatar) {
          case 'robot':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(action === 'focus' ? 660 : 440, now);
            osc.frequency.exponentialRampToValueAtTime(action === 'focus' ? 880 : 660, now + 0.08);
            gain.gain.setValueAtTime(vol * 0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.25);
            break;

          case 'cat':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);
            gain.gain.setValueAtTime(vol * 0.75, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.3);
            break;

          case 'owl':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(370, now);
            osc.frequency.exponentialRampToValueAtTime(310, now + 0.18);
            gain.gain.setValueAtTime(vol * 0.85, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.35);
            break;

          case 'crescent':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.5, now);
            osc.frequency.exponentialRampToValueAtTime(1308.1, now + 0.15);
            gain.gain.setValueAtTime(vol * 0.65, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.55);
            break;

          case 'sprout':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.08);
            gain.gain.setValueAtTime(vol * 0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.3);
            break;

          case 'lantern':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);
            gain.gain.setValueAtTime(vol * 0.75, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.45);
            break;

          case 'orb':
          default:
            osc.type = 'sine';
            osc.frequency.setValueAtTime(528, now);
            gain.gain.setValueAtTime(vol * 0.9, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.5);
            break;
        }
      } catch {}
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(runSynthesis).catch(runSynthesis);
    } else {
      runSynthesis();
    }
  }

  global.playCompanionSound = playCompanionSound;
})(window);
