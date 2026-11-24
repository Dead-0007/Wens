import React from 'react';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error || 'خطأ غير معروف');
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    try {
      console.error('[Wens ErrorBoundary]', error, info.componentStack);
    } catch {
      // ignore console failure
    }
  }

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      this.setState({ hasError: false, errorMessage: '' });
    }
  };

  handleClearCacheAndReload = (): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('wens-')) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      // ignore storage errors while recovering
    }
    this.handleReload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        dir="rtl"
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg, #0c1218)',
          color: 'var(--ink, #edf2f7)',
          fontFamily: 'system-ui, "Segoe UI", "Cairo", sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-elevated, #111a22)',
            border: '1px solid var(--border, rgba(255,255,255,0.12))',
            borderRadius: '18px',
            padding: '28px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              margin: '0 auto',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.16)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertCircle size={28} />
          </div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
            حدث خطأ غير متوقع في واجهة وِنس
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted, #8b9baa)', lineHeight: 1.6 }}>
            بياناتك الأساسية المحفوظة في قاعدة البيانات SQLite في أمان. يمكنك إعادة تحميل التطبيق أو تنظيف التخزين المؤقت التالف.
          </p>
          {this.state.errorMessage && (
            <code
              style={{
                display: 'block',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'var(--surface, #141f28)',
                color: '#f87171',
                fontSize: '12px',
                direction: 'ltr',
                wordBreak: 'break-word',
              }}
            >
              {this.state.errorMessage}
            </code>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
            <button
              type="button"
              className="primary-button"
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                minHeight: '44px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--primary, #d49748)',
                color: 'var(--primary-contrast, #0c1218)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={16} />
              <span>إعادة تحميل التطبيق</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={this.handleClearCacheAndReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                minHeight: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} />
              <span>تنظيف التخزين المؤقت وإعادة التشغيل</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
