import React, { useState } from 'react';
import { PackageOpen, Boxes, RotateCcw } from 'lucide-react';
import { PageTitle } from '../shared-ui';
import { previewModule, installModule, rollbackModule } from '../api';

export interface InstalledModuleRecord {
  id: string;
  name: string;
  version: string;
  rollbackPath?: string | null;
  hasRollback: boolean;
}

export function Modules() {
  const [path, setPath] = useState('');
  const [developer, setDeveloper] = useState(false);
  const [result, setResult] = useState('');
  const [ready, setReady] = useState(false);
  const [lastPreviewName, setLastPreviewName] = useState('');
  const [rollbackFeedback, setRollbackFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [modulesList, setModulesList] = useState<InstalledModuleRecord[]>(() => {
    try {
      const raw = localStorage.getItem('wens-installed-modules');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: 'com.wens.arabic-marketing',
        name: 'قوالب وأدوات التسويق العربي',
        version: '1.2.0',
        rollbackPath: '/data/rollback/com.wens.arabic-marketing-1.1.0.wenspack',
        hasRollback: true,
      },
    ];
  });

  const inspect = async () => {
    setReady(false);
    setRollbackFeedback(null);
    try {
      const preview = await previewModule(path, developer);
      setLastPreviewName(preview.manifest.name);
      setResult(
        `${preview.manifest.name} · الناشر: ${preview.manifest.publisher} · ${
          preview.files.length
        } ملفات · ${preview.signed ? 'توقيع صالح' : 'غير موقعة'}`
      );
      setReady(true);
    } catch (error) {
      setResult(String(error));
    }
  };

  const install = async () => {
    setRollbackFeedback(null);
    try {
      const installed = await installModule(path, developer);
      setResult(
        `تم تثبيت الحزمة ${installed.moduleId} v${installed.version} بنجاح محليًا${
          installed.rollbackPath ? ' (النسخة السابقة محفوظة للرجوع).' : '.'
        }`
      );
      setReady(false);
      setModulesList((prev) => {
        const existing = prev.find((m) => m.id === installed.moduleId);
        const updatedMod: InstalledModuleRecord = {
          id: installed.moduleId,
          name: lastPreviewName || existing?.name || installed.moduleId,
          version: installed.version,
          rollbackPath: installed.rollbackPath,
          hasRollback: Boolean(installed.rollbackPath),
        };
        const next = [updatedMod, ...prev.filter((m) => m.id !== installed.moduleId)];
        try {
          localStorage.setItem('wens-installed-modules', JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      setResult(String(error));
    }
  };

  const handleRollback = async (moduleId: string) => {
    setRollbackFeedback(null);
    try {
      const rollbackRes = await rollbackModule(moduleId);
      setRollbackFeedback({
        success: true,
        message: `تم التراجع للإصدار السابق بنجاح: الحزمة ${moduleId} أصبحت الآن بالإصدار v${rollbackRes.version}.`,
      });
      setModulesList((prev) => {
        const next = prev.map((m) =>
          m.id === moduleId
            ? { ...m, version: rollbackRes.version, hasRollback: false, rollbackPath: null }
            : m
        );
        try {
          localStorage.setItem('wens-installed-modules', JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      setRollbackFeedback({
        success: false,
        message: `فشل التراجع للإصدار السابق: ${String(error)}`,
      });
    }
  };

  return (
    <>
      <PageTitle
        title="الحزم والإضافات"
        copy="قوالب وثيمات بيانات نقية فقط (.wenspack) — لا تتضمن أكواد برمجية مشبوهة أو أوامر Shell."
      />
      <section className="surface module-installer">
        <PackageOpen size={32} style={{ color: 'var(--primary-hover)' }} />
        <div>
          <h2>فحص وتثبيت حزم .wenspack</h2>
          <p>
            تتحقق النواة من صحة المسارات والحجم والتجزئة (Hash) والتوقيع قبل تثبيت أي
            ملف.
          </p>
        </div>

        <label>
          مسار ملف الحزمة
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Packages\arabic-marketing.wenspack"
          />
        </label>

        <label className="switch-line">
          <input
            type="checkbox"
            checked={developer}
            onChange={(e) => setDeveloper(e.target.checked)}
          />
          <span>وضع المطور (Developer Mode) للسماح بالحزم غير الموقعة</span>
        </label>

        <div className="module-actions">
          <button className="primary-button" onClick={inspect} disabled={!path}>
            فحص الحزمة
          </button>
          {ready && (
            <button className="secondary-button" onClick={install}>
              تأكيد التثبيت
            </button>
          )}
        </div>

        {result && <output>{result}</output>}
      </section>

      <section className="modules-staged-list surface" style={{ marginTop: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Boxes size={24} style={{ color: 'var(--primary-hover)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '17px' }}>الحزم المثبتة والمجهزة (Installed & Staged)</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              قائمة الحزم المتاحة محليًا مع إمكانية التراجع الآمن لأي نسخة سابقة في حال حدوث خطأ.
            </p>
          </div>
        </div>

        {rollbackFeedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              background: rollbackFeedback.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${rollbackFeedback.success ? 'var(--primary-hover)' : '#ef4444'}`,
              color: 'var(--ink)',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {rollbackFeedback.message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {modulesList.map((mod) => (
            <div
              key={mod.id}
              className="module-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ fontSize: '15px' }}>{mod.name}</strong>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <code style={{ fontSize: '12px', color: 'var(--faint)' }}>{mod.id}</code>
                  <span style={{ fontSize: '12px', padding: '2px 6px', background: 'var(--surface)', borderRadius: '4px' }}>
                    v{mod.version}
                  </span>
                  {mod.hasRollback && (
                    <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                      (نسخة سابقة متاحة)
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => handleRollback(mod.id)}
                aria-label={`تراجع للإصدار السابق للحزمة ${mod.name}`}
              >
                <RotateCcw size={16} />
                تراجع للإصدار السابق (Rollback)
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
