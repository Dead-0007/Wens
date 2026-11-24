import React, { useState, useMemo, useEffect } from 'react';
import { Compass, MapPin, Monitor, Check, Sparkles, X, Search } from 'lucide-react';
import { CITIES_CATALOG, OfflineCity } from '../domain/cities-catalog';
import { normalizeCalcMethod } from '../domain/astronomy';

export interface OnboardingWizardProps {
  isOpen: boolean;
  onComplete: (config: {
    city: OfflineCity;
    taskbarEnabled: boolean;
    autostartEnabled: boolean;
    useEasternDigits: boolean;
  }) => Promise<void> | void;
  onClose?: () => void;
  initialCityId?: string;
}

function getCalcMethodLabelAr(rawMethod: string): string {
  switch (normalizeCalcMethod(rawMethod)) {
    case 'egypt':
      return 'الهيئة المصرية للمساحة';
    case 'umm_al_qura':
      return 'جامعة أم القرى (مكة المكرمة)';
    case 'karachi':
      return 'جامعة العلوم الإسلامية بكراتشي';
    case 'north_america':
      return 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)';
    case 'muslim_world_league':
    default:
      return 'رابطة العالم الإسلامي';
  }
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  isOpen,
  onComplete,
  onClose,
  initialCityId = 'eg-cairo',
}) => {
  const [selectedCityId, setSelectedCityId] = useState<string>(initialCityId);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskbarEnabled, setTaskbarEnabled] = useState(true);
  const [autostartEnabled, setAutostartEnabled] = useState(true);
  const [useEasternDigits, setUseEasternDigits] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && initialCityId) {
      setSelectedCityId(initialCityId);
    }
  }, [isOpen, initialCityId]);

  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CITIES_CATALOG;
    return CITIES_CATALOG.filter(
      (c) =>
        c.nameAr.toLowerCase().includes(q) ||
        c.countryAr.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Keep selectedCityId always synced to what is displayed when search filters out the current city
  useEffect(() => {
    if (filteredCities.length > 0 && !filteredCities.some((c) => c.id === selectedCityId)) {
      setSelectedCityId(filteredCities[0].id);
    }
  }, [filteredCities, selectedCityId]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const selectedCity = useMemo(() => {
    return (
      filteredCities.find((c) => c.id === selectedCityId) ||
      CITIES_CATALOG.find((c) => c.id === selectedCityId) ||
      CITIES_CATALOG[0]
    );
  }, [filteredCities, selectedCityId]);

  const popularCities = useMemo(
    () => [
      { id: 'eg-cairo', name: 'القاهرة' },
      { id: 'eg-alex', name: 'الإسكندرية' },
      { id: 'sa-makkah', name: 'مكة المكرمة' },
      { id: 'sa-madinah', name: 'المدينة' },
      { id: 'sa-riyadh', name: 'الرياض' },
      { id: 'ae-dubai', name: 'دبي' },
      { id: 'ps-jerusalem', name: 'القدس الشريف' },
    ],
    []
  );

  if (!isOpen) return null;

  const latDirAr = selectedCity.latitude >= 0 ? 'ش' : 'ج';
  const lngDirAr = selectedCity.longitude >= 0 ? 'ق' : 'غ';
  const latDirEn = selectedCity.latitude >= 0 ? 'N' : 'S';
  const lngDirEn = selectedCity.longitude >= 0 ? 'E' : 'W';

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await onComplete({
        city: selectedCity,
        taskbarEnabled,
        autostartEnabled,
        useEasternDigits,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="onboarding-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 10, 0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.25s ease',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="onboarding-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated, #111a22)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)',
          color: 'var(--ink, #edf2f7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '28px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'color-mix(in srgb, var(--primary, #d49748) 18%, transparent)',
                border: '1px solid color-mix(in srgb, var(--primary, #d49748) 38%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary, #d49748)',
                flexShrink: 0,
              }}
            >
              <Sparkles size={24} />
            </div>
            <div>
              <h2 id="onboarding-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink)' }}>
                أهلاً بك في وِنس (الإصدار ١.٠.٠)
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                رفيقك المحلي دون إنترنت — دعنا نضبط مواقيتك وسطح مكتبك في أقل من دقيقة.
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'var(--muted)',
                cursor: 'pointer',
                width: '44px',
                height: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="إغلاق المعالج"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* City Selection Section */}
        <div
          style={{
            background: 'var(--surface, #141f28)',
            borderRadius: '14px',
            padding: '18px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: 'var(--primary, #d49748)' }} />
            <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>
              اختر مدينتك لحساب المواقيت والقبلة محلياً
            </strong>
          </div>

          {/* Quick pick chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {popularCities.map((c) => {
              const active = selectedCityId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCityId(c.id);
                  }}
                  style={{
                    background: active ? 'var(--primary, #d49748)' : 'var(--surface-2, #1b2936)',
                    color: active ? 'var(--primary-contrast, #0c1218)' : 'var(--ink)',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* Search box & select */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '1 1 200px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  right: '12px',
                  color: 'var(--muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                aria-label="ابحث عن مدينة أو دولة"
                placeholder="ابحث عن مدينة أو دولة..."
                value={searchQuery}
                onChange={(e) => {
                  const nextQuery = e.target.value;
                  setSearchQuery(nextQuery);
                  const q = nextQuery.trim().toLowerCase();
                  if (q) {
                    const matches = CITIES_CATALOG.filter(
                      (c) =>
                        c.nameAr.toLowerCase().includes(q) ||
                        c.countryAr.toLowerCase().includes(q) ||
                        c.id.toLowerCase().includes(q)
                    );
                    if (matches.length > 0 && !matches.some((c) => c.id === selectedCityId)) {
                      setSelectedCityId(matches[0].id);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
            <select
              aria-label="قائمة المدن"
              value={selectedCity.id}
              onChange={(e) => setSelectedCityId(e.target.value)}
              style={{
                flex: '1 1 200px',
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {filteredCities.length === 0 ? (
                <option value={selectedCity.id}>لا توجد نتائج مطابقة ({selectedCity.nameAr})</option>
              ) : (
                filteredCities.map((city) => (
                  <option
                    key={city.id}
                    value={city.id}
                    style={{ background: 'var(--bg-elevated)', color: 'var(--ink)' }}
                  >
                    {city.nameAr} — {city.countryAr}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Selected city info badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'color-mix(in srgb, var(--primary, #d49748) 12%, var(--bg-elevated))',
              border: '1px solid color-mix(in srgb, var(--primary, #d49748) 32%, transparent)',
              fontSize: '0.85rem',
              color: 'var(--ink)',
            }}
          >
            <Compass size={16} style={{ color: 'var(--primary, #d49748)', flexShrink: 0 }} />
            <span>
              <strong>{selectedCity.nameAr}</strong> ({selectedCity.countryAr}) — الإحداثيات:{' '}
              {Math.abs(selectedCity.latitude).toFixed(2)}° {latDirAr} ({latDirEn})،{' '}
              {Math.abs(selectedCity.longitude).toFixed(2)}° {lngDirAr} ({lngDirEn}) · طريقة الحساب:{' '}
              {getCalcMethodLabelAr(selectedCity.calcMethod)}
            </span>
          </div>
        </div>

        {/* Windows & Desktop Integration Section */}
        <div
          style={{
            background: 'var(--surface, #141f28)',
            borderRadius: '14px',
            padding: '18px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <strong style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink)' }}>
            <Monitor size={18} style={{ color: 'var(--primary, #d49748)' }} />
            تكامل سطح مكتب Windows
          </strong>

          {/* Toggle: Taskbar Strip */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 0',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>
                شريط مهام Windows المدمج (Taskbar Strip)
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                يعرض الصلاة القادمة والعد التنازلي بجوار الساعة مباشرة بخفة تامة.
              </div>
            </div>
            <input
              type="checkbox"
              checked={taskbarEnabled}
              onChange={(e) => setTaskbarEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary, #d49748)', cursor: 'pointer', flexShrink: 0 }}
            />
          </label>

          {/* Toggle: Autostart with Windows */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 0',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>
                التشغيل التلقائي عند بدء Windows
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                يبدأ التطبيق في الخلفية بهدوء في صينية النظام ليضمن استمرار التنبيهات.
              </div>
            </div>
            <input
              type="checkbox"
              checked={autostartEnabled}
              onChange={(e) => setAutostartEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary, #d49748)', cursor: 'pointer', flexShrink: 0 }}
            />
          </label>

          {/* Toggle: Eastern Arabic Digits */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 0',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>
                استخدام الأرقام المشرقية في شريط المهام (١، ٢، ٣)
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                عرض الساعات والدقائق والعد التنازلي بالأرقام المشرقية في شريط المهام.
              </div>
            </div>
            <input
              type="checkbox"
              checked={useEasternDigits}
              onChange={(e) => setUseEasternDigits(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary, #d49748)', cursor: 'pointer', flexShrink: 0 }}
            />
          </label>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={handleFinish}
            disabled={isSubmitting}
            style={{
              background: 'var(--primary, #d49748)',
              color: 'var(--primary-contrast, #0c1218)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 28px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minHeight: '46px',
            }}
          >
            <Check size={18} />
            <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ والإطلاق إلى وِنس'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
