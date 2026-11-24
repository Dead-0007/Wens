import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Radio, Volume2, VolumeX, X } from 'lucide-react';
import { emitEvent, listenToEvent } from '../api';

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  fallbackUrl?: string;
}

export const POPULAR_RADIO_STATIONS: RadioStation[] = [
  {
    id: 'cairo',
    name: 'إذاعة القرآن الكريم من القاهرة',
    url: 'https://stream.radiojar.com/8s5u5tpdtwzuv',
    fallbackUrl: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary',
  },
  {
    id: 'saudi',
    name: 'إذاعة القرآن الكريم من السعودية',
    url: 'https://stream.radiojar.com/0tpy1h0kxtzuv',
    fallbackUrl: 'https://backup.qurango.net/radio/abdulrahman_alsudaes',
  },
  {
    id: 'makkah',
    name: 'إذاعة القرآن الكريم من مكة المكرمة',
    url: 'https://backup.qurango.net/radio/abdulrahman_alsudaes',
    fallbackUrl: 'https://backup.qurango.net/radio/maher',
  },
  { id: 'hussary', name: 'الشيخ محمود خليل الحصري (مرتل)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary' },
  { id: 'hussary-moallim', name: 'الشيخ محمود خليل الحصري (المصحف المعلم)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary_moalim' },
  { id: 'hussary-mujawwad', name: 'الشيخ محمود خليل الحصري (المصحف المجود)', url: 'https://backup.qurango.net/radio/mahmoud_khalil_alhussary_mojawwad' },
  { id: 'abdulbasit', name: 'الشيخ عبد الباسط عبد الصمد (مجود)', url: 'https://backup.qurango.net/radio/abdulbasit_abdulsamad_mojawwad' },
  { id: 'abdulbasit-murattal', name: 'الشيخ عبد الباسط عبد الصمد (مرتل)', url: 'https://backup.qurango.net/radio/abdulbasit_abdulsamad' },
  { id: 'minshawi', name: 'الشيخ محمد صديق المنشاوي (مرتل)', url: 'https://backup.qurango.net/radio/mohammed_siddiq_alminshawi' },
  { id: 'minshawi-mujawwad', name: 'الشيخ محمد صديق المنشاوي (مجود)', url: 'https://backup.qurango.net/radio/mohammed_siddiq_alminshawi_mojawwad' },
  { id: 'mustafa-ismail', name: 'الشيخ مصطفى إسماعيل (مرتل)', url: 'https://backup.qurango.net/radio/mustafa_ismail' },
  { id: 'banna', name: 'الشيخ محمود علي البنا (مرتل)', url: 'https://backup.qurango.net/radio/mahmoud_ali__albanna' },
  { id: 'tablawi', name: 'الشيخ محمد محمود الطبلاوي', url: 'https://backup.qurango.net/radio/mohammad_altablaway' },
  { id: 'ali-jaber', name: 'الشيخ علي عبد الله جابر', url: 'https://backup.qurango.net/radio/ali_jaber' },
  { id: 'afasy', name: 'الشيخ مشاري راشد العفاسي', url: 'https://backup.qurango.net/radio/mishary_alafasi' },
  { id: 'maher', name: 'الشيخ ماهر المعيقلي', url: 'https://backup.qurango.net/radio/maher' },
  { id: 'dosari', name: 'الشيخ ياسر الدوسري', url: 'https://backup.qurango.net/radio/yasser_aldosari' },
  { id: 'ghamdi', name: 'الشيخ سعد الغامدي', url: 'https://backup.qurango.net/radio/saad_alghamdi' },
  { id: 'shuraim', name: 'الشيخ سعود الشريم', url: 'https://backup.qurango.net/radio/saud_alshuraim' },
  { id: 'sudais', name: 'الشيخ عبد الرحمن السديس', url: 'https://backup.qurango.net/radio/abdulrahman_alsudaes' },
  { id: 'qatami', name: 'الشيخ ناصر القطامي', url: 'https://backup.qurango.net/radio/nasser_alqatami' },
  { id: 'idrees', name: 'الشيخ إدريس أبكر', url: 'https://backup.qurango.net/radio/idrees_abkr' },
  { id: 'ajamy', name: 'الشيخ أحمد بن علي العجمي', url: 'https://backup.qurango.net/radio/ahmad_alajmy' },
  { id: 'faris-abbad', name: 'الشيخ فارس عباد', url: 'https://backup.qurango.net/radio/fares_abbad' },
  { id: 'abu-bakr-shatri', name: 'الشيخ أبو بكر الشاطري', url: 'https://backup.qurango.net/radio/shaik_abu_bakr_al_shatri' },
  { id: 'hudhaify', name: 'الشيخ علي بن عبد الرحمن الحذيفي', url: 'https://backup.qurango.net/radio/ali_alhuthaifi' },
  { id: 'rifai', name: 'الشيخ هاني الرفاعي', url: 'https://backup.qurango.net/radio/hani_arrifai' },
  { id: 'khalid-aljalil', name: 'الشيخ خالد الجليل', url: 'https://backup.qurango.net/radio/khalid_aljileel' },
  { id: 'muhammad-ayyoub', name: 'الشيخ محمد أيوب', url: 'https://backup.qurango.net/radio/mohammed_ayyub' },
  { id: 'tarateel', name: 'تراتيل قصيرة متميزة', url: 'https://backup.qurango.net/radio/tarateel' },
  { id: 'fatwa', name: 'إذاعة الفتاوى العامة', url: 'https://backup.qurango.net/radio/fatwa' },
  { id: 'roqya', name: 'الرقية الشرعية', url: 'https://backup.qurango.net/radio/roqiah' },
  { id: 'tafsir', name: 'تفسير القرآن الكريم', url: 'https://backup.qurango.net/radio/tafseer' },
];

const LOAD_TIMEOUT_MS = 15000;

export interface QuranRadioController {
  stationId: string;
  currentStation: RadioStation;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  errorMessage: string | null;
  strictOffline: boolean;
  enabled: boolean;
  togglePlay: () => void;
  stop: () => void;
  selectStation: (newId: string) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  clearError: () => void;
}

const QuranRadioContext = createContext<QuranRadioController | null>(null);

function useQuranRadioController(options: {
  strictOffline: boolean;
  enabled: boolean;
  pauseAtPrayer?: boolean;
  defaultStation?: string;
}): QuranRadioController {
  const { strictOffline, enabled, pauseAtPrayer = true, defaultStation = 'cairo' } = options;
  const pauseAtPrayerRef = useRef(pauseAtPrayer);
  useEffect(() => {
    pauseAtPrayerRef.current = pauseAtPrayer;
  }, [pauseAtPrayer]);
  const [stationId, setStationId] = useState<string>(() => {
    const valid = POPULAR_RADIO_STATIONS.some((s) => s.id === defaultStation);
    return valid ? defaultStation : 'cairo';
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptGenRef = useRef<number>(0);

  const currentStation = useMemo(
    () => POPULAR_RADIO_STATIONS.find((s) => s.id === stationId) || POPULAR_RADIO_STATIONS[0],
    [stationId]
  );

  // Sync defaultStation from settings when idle
  useEffect(() => {
    if (!isPlaying && !isLoading && defaultStation) {
      if (POPULAR_RADIO_STATIONS.some((s) => s.id === defaultStation)) {
        setStationId(defaultStation);
      }
    }
  }, [defaultStation, isPlaying, isLoading]);

  const clearLoadTimer = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    attemptGenRef.current += 1;
    clearLoadTimer();
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {
        // ignore audio reset error
      }
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, [clearLoadTimer]);

  const broadcastMainRadioStarted = useCallback((id: string) => {
    void emitEvent('wens-radio-started', { source: 'main', stationId: id });
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel('wens-state');
        ch.postMessage({ type: 'wens-radio-started', source: 'main', stationId: id });
        ch.close();
      } catch {
        // ignore
      }
    }
  }, []);

  const startStation = useCallback(
    (station: RadioStation, useFallback = false) => {
      if (strictOffline || !enabled) {
        stop();
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        stop();
        setErrorMessage('لا يوجد اتصال بالإنترنت حالياً — إذاعة القرآن تحتاج إلى اتصال نشط.');
        return;
      }

      const targetUrl = useFallback && station.fallbackUrl ? station.fallbackUrl : station.url;
      const gen = ++attemptGenRef.current;
      clearLoadTimer();
      setErrorMessage(null);
      setIsLoading(true);
      setIsPlaying(false);

      if (!audioRef.current && typeof Audio !== 'undefined') {
        const el = new Audio();
        el.preload = 'none';
        audioRef.current = el;
      }
      const audio = audioRef.current;
      if (!audio) {
        setIsLoading(false);
        setErrorMessage('تعذر تهيئة مشغل الصوت في هذه البيئة.');
        return;
      }

      const failAttempt = (reason: string) => {
        if (attemptGenRef.current !== gen) return;
        clearLoadTimer();
        if (!useFallback && station.fallbackUrl && targetUrl !== station.fallbackUrl) {
          startStation(station, true);
          return;
        }
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
        setIsPlaying(false);
        setIsLoading(false);
        setErrorMessage(reason);
      };

      audio.onplaying = () => {
        if (attemptGenRef.current !== gen) return;
        clearLoadTimer();
        setIsLoading(false);
        setIsPlaying(true);
        setErrorMessage(null);
      };

      audio.onerror = () => {
        failAttempt('تعذر الاتصال بالمحطة الإذاعية — تحقق من الشبكة أو اختر قارئاً آخر.');
      };

      audio.onstalled = () => {
        if (attemptGenRef.current !== gen) return;
        if (!loadTimeoutRef.current) {
          loadTimeoutRef.current = setTimeout(() => {
            failAttempt('انقطع البث أو تأخر تحميل المحطة لأكثر من ١٥ ثانية.');
          }, LOAD_TIMEOUT_MS);
        }
      };

      audio.onended = () => {
        if (attemptGenRef.current !== gen) return;
        clearLoadTimer();
        setIsPlaying(false);
        setIsLoading(false);
      };

      loadTimeoutRef.current = setTimeout(() => {
        failAttempt('انتهت مهلة الاتصال بالبث (١٥ ثانية) — تحقق من الإنترنت أو جرّب محطة بديلة.');
      }, LOAD_TIMEOUT_MS);

      audio.volume = isMuted ? 0 : volume;
      audio.src = targetUrl;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (attemptGenRef.current !== gen) {
              try {
                audio.pause();
              } catch {}
              return;
            }
            clearLoadTimer();
            setIsLoading(false);
            setIsPlaying(true);
            setErrorMessage(null);
            broadcastMainRadioStarted(station.id);
          })
          .catch(() => {
            failAttempt('تعذر تشغيل البث المباشر — تحقق من اتصال الإنترنت أو جرّب محطة أخرى.');
          });
      }
    },
    [strictOffline, enabled, stop, clearLoadTimer, isMuted, volume, broadcastMainRadioStarted]
  );

  // Stop immediately when strictOffline turns ON or radio feature turns OFF
  useEffect(() => {
    if (strictOffline || !enabled) {
      stop();
    }
  }, [strictOffline, enabled, stop]);

  // Stop immediately if Adhan/alarm starts or overlay radio starts
  useEffect(() => {
    let cancelled = false;
    let unlistenAudio = () => {};
    let unlistenCritical = () => {};
    let unlistenRadioStarted = () => {};
    let channel: BroadcastChannel | null = null;

    listenToEvent<{ kind?: string }>('wens-audio-playing', (payload) => {
      const kind = payload?.kind || '';
      if (pauseAtPrayerRef.current && (kind.startsWith('prayer-') || kind === 'adhan-test')) {
        stop();
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenAudio = fn;
    });

    listenToEvent('wens-critical-alarm', () => {
      stop();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenCritical = fn;
    });

    listenToEvent<{ source?: string }>('wens-radio-started', (payload) => {
      if (payload && payload.source && payload.source !== 'main') {
        stop();
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenRadioStarted = fn;
    });

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('wens-state');
        channel.onmessage = (ev) => {
          if (ev.data?.type === 'wens-radio-started' && ev.data?.source && ev.data.source !== 'main') {
            stop();
          }
        };
      } catch {
        // ignore
      }
    }

    return () => {
      cancelled = true;
      unlistenAudio();
      unlistenCritical();
      unlistenRadioStarted();
      channel?.close();
    };
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
      audioRef.current = null;
    };
  }, [stop]);

  const togglePlay = useCallback(() => {
    if (strictOffline || !enabled) return;
    if (isLoading || isPlaying) {
      stop();
      setErrorMessage(null);
    } else {
      startStation(currentStation, false);
    }
  }, [strictOffline, enabled, isLoading, isPlaying, stop, startStation, currentStation]);

  const selectStation = useCallback(
    (newId: string) => {
      setStationId(newId);
      setErrorMessage(null);
      if ((isPlaying || isLoading) && !strictOffline && enabled) {
        const target = POPULAR_RADIO_STATIONS.find((s) => s.id === newId);
        if (target) {
          startStation(target, false);
        }
      }
    },
    [isPlaying, isLoading, strictOffline, enabled, startStation]
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (clamped > 0) setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const nextMute = !prev;
      if (audioRef.current) {
        audioRef.current.volume = nextMute ? 0 : volume;
      }
      return nextMute;
    });
  }, [volume]);

  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
    stationId,
    currentStation,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    errorMessage,
    strictOffline,
    enabled,
    togglePlay,
    stop,
    selectStation,
    setVolume,
    toggleMute,
    clearError,
  };
}

export const QuranRadioProvider: React.FC<{
  strictOffline?: boolean;
  enabled?: boolean;
  pauseAtPrayer?: boolean;
  defaultStation?: string;
  children: React.ReactNode;
}> = ({ strictOffline = false, enabled = true, pauseAtPrayer = true, defaultStation = 'cairo', children }) => {
  const controller = useQuranRadioController({ strictOffline, enabled, pauseAtPrayer, defaultStation });
  return <QuranRadioContext.Provider value={controller}>{children}</QuranRadioContext.Provider>;
};

export function useQuranRadio(): QuranRadioController | null {
  return useContext(QuranRadioContext);
}

export function QuranRadioWidget({
  strictOffline = false,
  defaultStation = 'cairo',
}: {
  strictOffline?: boolean;
  defaultStation?: string;
}) {
  const ctx = useContext(QuranRadioContext);
  const standalone = useQuranRadioController({
    strictOffline,
    enabled: !ctx,
    defaultStation,
  });
  const ctrl = ctx || standalone;
  const effectiveOffline = strictOffline || ctrl.strictOffline;

  return (
    <div className="productivity-widget-card radio-widget" aria-labelledby="radioWidgetTitle">
      <div className="widget-card-header">
        <div className="widget-header-title">
          <Radio size={18} style={{ color: 'var(--accent, #d49748)' }} />
          <span id="radioWidgetTitle">إذاعة القرآن الكريم</span>
        </div>
        <span
          className={`widget-badge ${
            effectiveOffline ? 'offline' : ctrl.isPlaying ? 'active' : ''
          }`}
        >
          {effectiveOffline
            ? 'الوضع غير المتصل'
            : ctrl.isLoading
            ? 'جارٍ الاتصال…'
            : ctrl.isPlaying
            ? 'بث مباشر'
            : 'متوقف'}
        </span>
      </div>

      {effectiveOffline ? (
        <div className="radio-offline-alert">
          الوضع غير المتصل مفعل لحماية الخصوصية. تم حجب البث الصوتي المباشر لتجنب أي اتصالات بالشبكة.
        </div>
      ) : (
        <>
          <select
            className="radio-select-station"
            value={ctrl.stationId}
            onChange={(e) => ctrl.selectStation(e.target.value)}
            aria-label="اختيار محطة إذاعة القرآن الكريم"
          >
            {POPULAR_RADIO_STATIONS.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>

          <div className="radio-controls-row">
            <button
              type="button"
              className={`radio-play-btn ${ctrl.isPlaying ? 'playing' : ''}`}
              onClick={ctrl.togglePlay}
              aria-label={
                ctrl.isLoading
                  ? 'إلغاء الاتصال بالبث'
                  : ctrl.isPlaying
                  ? 'إيقاف البث'
                  : 'تشغيل البث المباشر'
              }
            >
              {ctrl.isLoading ? (
                <X size={15} />
              ) : ctrl.isPlaying ? (
                <Pause size={15} />
              ) : (
                <Play size={15} />
              )}
              <span>
                {ctrl.isLoading
                  ? 'إلغاء التحميل'
                  : ctrl.isPlaying
                  ? 'إيقاف مؤقت'
                  : 'استماع الآن'}
              </span>
            </button>

            <div className="radio-volume-wrap">
              <button
                type="button"
                className="icon-button"
                onClick={ctrl.toggleMute}
                aria-label={ctrl.isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                style={{ minHeight: '36px', minWidth: '36px', padding: 0 }}
              >
                {ctrl.isMuted || ctrl.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                className="radio-volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={ctrl.isMuted ? 0 : ctrl.volume}
                onChange={(e) => ctrl.setVolume(Number(e.target.value))}
                aria-label="مستوى صوت الإذاعة"
              />
            </div>
          </div>

          {ctrl.errorMessage && (
            <div className="radio-offline-alert" role="alert">
              {ctrl.errorMessage}
            </div>
          )}
        </>
      )}
    </div>
  );
}
