import React from 'react';
import { PageTitle } from '../shared-ui';

export function Devices({ deviceId }: { deviceId: string }) {
  return (
    <>
      <PageTitle
        title="الأجهزة"
        copy="مزامنة مشفرة محليًا بين أجهزتك بدون سحابة خارجية أو تتبع."
      />
      <div className="surface" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>معرّف هذا الجهاز (Device ID)</span>
          <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>{deviceId}</div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6 }}>
          المزامنة اللامركزية (LAN Sync) قيد التطوير في الإصدار القادم. بياناتك محفوظة حاليًا بأمان تام على هذا الجهاز فقط.
        </p>
        <aside>
          <button className="secondary-button" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            إضافة جهاز عبر الشبكة
          </button>
        </aside>
      </div>
    </>
  );
}
