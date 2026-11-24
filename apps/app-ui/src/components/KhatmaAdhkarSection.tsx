import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, CheckCircle2, Plus, RotateCcw, Sparkles } from 'lucide-react';
import {
  getKhatmaState,
  hydrateKhatmaFromSqlite,
  saveKhatmaState,
  type KhatmaState,
} from '../repository/worship-storage';
import { formatArabicDigits, toLocalDateString } from '../domain/formatters';
import { getDomainKv, isPlainObject, safeSetLocalStorage, setDomainKv } from '../api';

type AdhkarCategory = 'morning' | 'evening' | 'post-prayer' | 'sleep';

interface DhikrItem {
  id: string;
  text: string;
  target: number;
  virtue: string;
}

const ADHKAR_CATEGORIES: Array<{ id: AdhkarCategory; label: string }> = [
  { id: 'morning', label: 'أذكار الصباح' },
  { id: 'evening', label: 'أذكار المساء' },
  { id: 'post-prayer', label: 'بعد الصلاة' },
  { id: 'sleep', label: 'أذكار النوم' },
];

const ADHKAR_DATA: Record<AdhkarCategory, DhikrItem[]> = {
  morning: [
    {
      id: 'm-kursi',
      text: 'آية الكرسي: ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ…﴾',
      target: 1,
      virtue: 'من قرأها حين يصبح أُجير من الجن حتى يمسي.',
    },
    {
      id: 'm-muawwidhat',
      text: 'قراءة سورة الإخلاص والفلق والناس',
      target: 3,
      virtue: 'تكفيك من كل شيء بإذن الله.',
    },
    {
      id: 'm-asbahna',
      text: 'أصبحنا وأصبح الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.',
      target: 1,
      virtue: 'ثناء وحفظ في بداية اليوم.',
    },
    {
      id: 'm-sayyid',
      text: 'سيد الاستغفار: اللهم أنت ربي لا إله إلا أنت خلقتني وأنا عبدك…',
      target: 1,
      virtue: 'من قالها موقناً بها حين يصبح فمات من يومه دخل الجنة.',
    },
    {
      id: 'm-bismillah',
      text: 'بسم الله الذي لا يضر مع اسمه شيء في الأرض ولا في السماء وهو السميع العليم.',
      target: 3,
      virtue: 'لم يضره شيء حتى يمسي.',
    },
    {
      id: 'm-tasbih',
      text: 'سبحان الله وبحمده',
      target: 100,
      virtue: 'حُطّت خطاياه وإن كانت مثل زبد البحر.',
    },
  ],
  evening: [
    {
      id: 'e-kursi',
      text: 'آية الكرسي: ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ…﴾',
      target: 1,
      virtue: 'من قرأها حين يمسي أُجير من الجن حتى يصبح.',
    },
    {
      id: 'e-muawwidhat',
      text: 'قراءة سورة الإخلاص والفلق والناس',
      target: 3,
      virtue: 'حرز وكفاية للمسلم في ليلته.',
    },
    {
      id: 'e-amsayna',
      text: 'أمسينا وأمسى الملك لله، والحمد لله، لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.',
      target: 1,
      virtue: 'ذكر المساء المبارك.',
    },
    {
      id: 'e-audhu',
      text: 'أعوذ بكلمات الله التامات من شر ما خلق.',
      target: 3,
      virtue: 'حفظ من كل سوء في الليل.',
    },
    {
      id: 'e-hasbi',
      text: 'حسبي الله لا إله إلا هو عليه توكلت وهو رب العرش العظيم.',
      target: 7,
      virtue: 'كفاه الله ما أهمّه من أمر الدنيا والآخرة.',
    },
  ],
  'post-prayer': [
    {
      id: 'p-istighfar',
      text: 'أستغفر الله العظيم (ثلاثاً)، اللهم أنت السلام ومنك السلام تباركت يا ذا الجلال والإكرام.',
      target: 3,
      virtue: 'سنة النبي ﷺ فور التسليم من الصلاة.',
    },
    {
      id: 'p-subhan',
      text: 'سبحان الله',
      target: 33,
      virtue: 'من التسبيحات المأثورة دبر كل صلاة مكتوبة.',
    },
    {
      id: 'p-hamd',
      text: 'الحمد لله',
      target: 33,
      virtue: 'من التحميدات المأثورة دبر كل صلاة مكتوبة.',
    },
    {
      id: 'p-akbar',
      text: 'الله أكبر',
      target: 33,
      virtue: 'وتُختم المئة بلا إله إلا الله وحده لا شريك له.',
    },
    {
      id: 'p-tahlil',
      text: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.',
      target: 1,
      virtue: 'تمام المئة دبر الصلاة.',
    },
  ],
  sleep: [
    {
      id: 's-kursi',
      text: 'آية الكرسي قبل النوم',
      target: 1,
      virtue: 'لا يزال عليك من الله حافظ حتى تصبح.',
    },
    {
      id: 's-baqara',
      text: 'آخر آيتين من سورة البقرة (آمن الرسول…)',
      target: 1,
      virtue: 'من قرأهما في ليلة كفتاه.',
    },
    {
      id: 's-bismika',
      text: 'باسمك اللهم أموت وأحيا.',
      target: 1,
      virtue: 'دعاء السكينة عند إغماض العينين.',
    },
    {
      id: 's-tasbih',
      text: 'سبحان الله (٣٣) · الحمد لله (٣٣) · الله أكبر (٣٤)',
      target: 33,
      virtue: 'وصية النبي ﷺ لفاطمة وعلي رضي الله عنهما.',
    },
  ],
};

function loadAdhkarCounts(dateStr: string): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`wens-adhkar-${dateStr}`);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        out[k] = Math.floor(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const KhatmaAdhkarSection: React.FC<{
  dateKey?: string;
  triggerToast?: (title: string, body: string) => void;
}> = ({ dateKey, triggerToast }) => {
  const todayStr = dateKey || toLocalDateString();
  const [khatma, setKhatma] = useState<KhatmaState>(() => getKhatmaState());
  const [activeCategory, setActiveCategory] = useState<AdhkarCategory>(() => {
    const h = new Date().getHours();
    if (h >= 4 && h < 12) return 'morning';
    if (h >= 15 && h < 21) return 'evening';
    return 'sleep';
  });
  const [adhkarCounts, setAdhkarCounts] = useState<Record<string, number>>(() =>
    loadAdhkarCounts(todayStr)
  );

  useEffect(() => {
    let active = true;
    hydrateKhatmaFromSqlite().then((hydrated) => {
      if (active) setKhatma(hydrated);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const localCounts = loadAdhkarCounts(todayStr);
    setAdhkarCounts(localCounts);
    getDomainKv(`adhkar_${todayStr}`)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (isPlainObject(parsed)) {
          const merged = { ...localCounts };
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && Number.isFinite(v)) {
              merged[k] = Math.max(merged[k] || 0, Math.floor(v));
            }
          }
          setAdhkarCounts(merged);
          safeSetLocalStorage(`wens-adhkar-${todayStr}`, JSON.stringify(merged));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [todayStr]);

  const updateKhatma = (patch: Partial<KhatmaState>, toastMsg?: string) => {
    const next = saveKhatmaState(patch);
    setKhatma(next);
    if (toastMsg && triggerToast) {
      triggerToast('الختمة والورد القرآني', toastMsg);
    }
  };

  const persistAdhkar = (next: Record<string, number>) => {
    setAdhkarCounts(next);
    const serialized = JSON.stringify(next);
    safeSetLocalStorage(`wens-adhkar-${todayStr}`, serialized);
    void setDomainKv(`adhkar_${todayStr}`, serialized).catch(() => {});
  };

  const handleTapDhikr = (item: DhikrItem) => {
    const cur = adhkarCounts[item.id] || 0;
    if (cur >= item.target) return;
    const nextVal = cur + 1;
    const next = { ...adhkarCounts, [item.id]: nextVal };
    persistAdhkar(next);
    if (nextVal === item.target && triggerToast) {
      triggerToast('ذكر مكتمل', 'تقبل الله ذكرك وطاعتك.');
    }
  };

  const handleResetCategory = () => {
    const next = { ...adhkarCounts };
    for (const item of ADHKAR_DATA[activeCategory]) {
      delete next[item.id];
    }
    persistAdhkar(next);
  };

  const khatmaPercent = Math.min(100, Math.round((khatma.currentPage / 604) * 100));
  const dailyPagesTarget = Math.max(1, Math.ceil(604 / Math.max(1, khatma.targetDays)));
  const remainingPages = Math.max(0, 604 - khatma.currentPage);

  const currentItems = ADHKAR_DATA[activeCategory];
  const completedInCategory = useMemo(
    () => currentItems.filter((it) => (adhkarCounts[it.id] || 0) >= it.target).length,
    [currentItems, adhkarCounts]
  );

  return (
    <div className="khatma-adhkar-grid">
      {/* Khatma & Quran Ward Card */}
      <section className="worship-card khatma-card" aria-labelledby="khatma-card-title">
        <div>
          <div className="khatma-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={20} style={{ color: 'var(--primary, #d49748)' }} />
              <div>
                <h3 id="khatma-card-title" style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                  الختمة والورد القرآني
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  الورد اليومي المقترح: {formatArabicDigits(dailyPagesTarget)} صفحة يومياً ({formatArabicDigits(khatma.targetDays)} يوماً)
                </p>
              </div>
            </div>
            <span className="khatma-pct-badge">{formatArabicDigits(khatmaPercent)}٪</span>
          </div>

          <div className="khatma-stats-row">
            <div className="khatma-stat-box">
              <span>الجزء الحالي</span>
              <strong>الجزء {formatArabicDigits(khatma.currentJuz)} / ٣٠</strong>
            </div>
            <div className="khatma-stat-box">
              <span>الصفحة الحالية</span>
              <strong>{formatArabicDigits(khatma.currentPage)} / ٦٠٤</strong>
            </div>
            <div className="khatma-stat-box">
              <span>المتبقي للختم</span>
              <strong>{formatArabicDigits(remainingPages)} صفحة</strong>
            </div>
          </div>

          <div className="khatma-progress-track" aria-label={`نسبة إنجاز الختمة ${khatmaPercent} في المئة`}>
            <div className="khatma-progress-fill" style={{ width: `${khatmaPercent}%` }} />
          </div>

          <div className="khatma-quick-actions">
            <button
              type="button"
              className="worship-btn-primary"
              style={{ padding: '8px 12px', fontSize: '13px' }}
              onClick={() =>
                updateKhatma(
                  { currentPage: Math.min(604, khatma.currentPage + 1) },
                  `تم التقدم إلى صفحة ${formatArabicDigits(Math.min(604, khatma.currentPage + 1))}`
                )
              }
            >
              <Plus size={14} />
              <span>+١ صفحة</span>
            </button>
            <button
              type="button"
              className="worship-btn-secondary"
              style={{ padding: '8px 12px', fontSize: '13px' }}
              onClick={() =>
                updateKhatma(
                  { currentPage: Math.min(604, khatma.currentPage + 5) },
                  `تم التقدم ٥ صفحات إلى صفحة ${formatArabicDigits(Math.min(604, khatma.currentPage + 5))}`
                )
              }
            >
              <span>+٥ صفحات</span>
            </button>
            <button
              type="button"
              className="worship-btn-secondary"
              style={{ padding: '8px 12px', fontSize: '13px' }}
              onClick={() =>
                updateKhatma(
                  { currentPage: Math.min(604, khatma.currentPage + 20) },
                  `أتممت جزءاً كاملاً — وصلت للصفحة ${formatArabicDigits(Math.min(604, khatma.currentPage + 20))}`
                )
              }
            >
              <span>+جزء (٢٠ ص)</span>
            </button>
          </div>
        </div>

        <div className="khatma-footer-controls">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--muted)' }}>
            <span>مدة الختمة:</span>
            <select
              aria-label="مدة الختمة المستهدفة"
              className="setting-select"
              style={{ minHeight: '36px', padding: '4px 10px', fontSize: '12.5px' }}
              value={khatma.targetDays}
              onChange={(e) => updateKhatma({ targetDays: Number(e.target.value) })}
            >
              <option value={15}>١٥ يوماً</option>
              <option value={30}>٣٠ يوماً (شهر)</option>
              <option value={60}>٦٠ يوماً (شهران)</option>
              <option value={90}>٩٠ يوماً</option>
            </select>
          </label>
          <button
            type="button"
            className="worship-review-btn-defer"
            onClick={() =>
              updateKhatma(
                { currentJuz: 1, currentPage: 1, startDate: todayStr },
                'بدأت ختمة جديدة من الصفحة ١ — تقبل الله منك.'
              )
            }
          >
            <RotateCcw size={13} style={{ marginInlineEnd: '4px', verticalAlign: 'middle' }} />
            <span>ختمة جديدة</span>
          </button>
        </div>
      </section>

      {/* Interactive Adhkar Card */}
      <section className="worship-card adhkar-card" aria-labelledby="adhkar-card-title">
        <div>
          <div className="khatma-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={20} style={{ color: 'var(--primary, #d49748)' }} />
              <div>
                <h3 id="adhkar-card-title" style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                  الأذكار اليومية
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  أتممت {formatArabicDigits(completedInCategory)} من {formatArabicDigits(currentItems.length)} في هذا القسم
                </p>
              </div>
            </div>
            <button
              type="button"
              className="worship-review-btn-defer"
              onClick={handleResetCategory}
              aria-label="تصفير عداد هذا القسم"
            >
              <RotateCcw size={13} style={{ marginInlineEnd: '4px', verticalAlign: 'middle' }} />
              <span>تصفير</span>
            </button>
          </div>

          <div className="adhkar-category-tabs" role="tablist" aria-label="أقسام الأذكار">
            {ADHKAR_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                className={`adhkar-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="adhkar-list">
            {currentItems.map((item) => {
              const count = adhkarCounts[item.id] || 0;
              const done = count >= item.target;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`adhkar-item-btn ${done ? 'done' : ''}`}
                  onClick={() => handleTapDhikr(item)}
                  aria-label={`${item.text} — ${count} من ${item.target}`}
                >
                  <div className="adhkar-item-body">
                    <strong>{item.text}</strong>
                    <span>{item.virtue}</span>
                  </div>
                  <span className={`adhkar-count-pill ${done ? 'done' : ''}`}>
                    {done ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>تم</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} style={{ opacity: 0.4 }} />
                        <span>
                          {formatArabicDigits(count)} / {formatArabicDigits(item.target)}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
