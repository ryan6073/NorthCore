import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onClose: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  content,
  confirmText = '确定',
  cancelText = '取消',
  type = 'danger',
  onConfirm,
  onClose,
}) => {
  if (!open) return null;

  const getThemeClasses = () => {
    switch (type) {
      case 'danger':
        return {
          iconBg: 'bg-red-50 text-red-500 border border-red-100',
          btnBg: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500/30',
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-50 text-amber-500 border border-amber-100',
          btnBg: 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500/30',
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-blue-50 text-blue-500 border border-blue-100',
          btnBg: 'bg-lark-primary hover:bg-lark-primary-hover text-white focus:ring-lark-primary/30',
        };
    }
  };

  const theme = getThemeClasses();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Dialog box */}
      <div className="bg-white border border-lark-border rounded-2xl shadow-2xl max-w-sm w-full z-10 overflow-hidden transform transition-all duration-300 animate-scale-in flex flex-col relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5 flex gap-4 items-start">
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${theme.iconBg}`}>
            {type === 'info' ? (
              <Info className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-1.5 leading-snug">{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{content}</p>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs font-semibold rounded-xl transition-all duration-155 active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all duration-155 active:scale-95 focus:outline-none focus:ring-4 ${theme.btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
