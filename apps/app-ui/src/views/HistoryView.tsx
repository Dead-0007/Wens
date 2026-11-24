import React from 'react';
import { PageTitle, digits, prayerKeys } from '../shared-ui';
import type { BootstrapPayload } from '../types';

export function HistoryView({
  data,
  checks,
  elapsed,
}: {
  data: BootstrapPayload;
  checks: Record<string, boolean>;
  elapsed: number;
}) {
  return (
    <>
      <PageTitle
        title="السجل"
        copy="سجل محلي هادئ يعرض تقدم صلواتك وأوقات تركيزك بدون تقييم خارجي."
      />
      <section className="history-summary surface">
        <div>
          <span>الصلوات المؤداة اليوم</span>
          <strong>{digits(prayerKeys.filter((key) => checks[key]).length)} / ٥</strong>
        </div>
        <div>
          <span>صيام اليوم</span>
          <strong>{checks.fasting ? 'مسجّل' : 'غير مسجّل'}</strong>
        </div>
        <div>
          <span>جلسات التركيز</span>
          <strong>{digits(Math.floor(elapsed / 60000))} دقيقة</strong>
        </div>
        <div>
          <span>إجمالي المشروعات</span>
          <strong>{digits(data.projects.length)}</strong>
        </div>
      </section>

      {data.migration && (
        <section className="surface migration-details" style={{ marginTop: '16px' }}>
          <h2>سجل ترحيل البيانات</h2>
          <dl>
            <div>
              <dt>من إصدار</dt>
              <dd>v{digits(data.migration.fromVersion)}</dd>
            </div>
            <div>
              <dt>إلى إصدار</dt>
              <dd>v{digits(data.migration.toVersion)}</dd>
            </div>
            {Object.entries(data.migration.counts).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{digits(value)}</dd>
              </div>
            ))}
          </dl>
          <p style={{ marginTop: '12px' }}>
            مسار النسخة الاحتياطية المضمونة:{' '}
            <code>{data.migration.backupPath || 'محفوظ داخل قاعدة البيانات SQLite'}</code>
          </p>
        </section>
      )}
    </>
  );
}
