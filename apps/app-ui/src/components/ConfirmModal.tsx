import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="confirm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} style={{ color: danger ? 'var(--danger, #ef4444)' : 'var(--primary, #d49748)' }} />
            <h3 id="confirm-modal-title" style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            disabled={busy}
            aria-label="إغلاق نافذة التأكيد"
          >
            <X size={18} />
          </button>
        </div>
        <p className="confirm-modal-desc">{description}</p>
        <div className="confirm-modal-actions">
          <button
            type="button"
            className={danger ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'جاري التنفيذ...' : confirmLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
