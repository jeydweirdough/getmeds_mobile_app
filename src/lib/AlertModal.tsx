'use client';

import { useEffect, useState } from 'react';
import { useLang } from './i18n';

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string | string[];
}

export default function AlertModal({ open, onClose, title, message }: AlertModalProps) {
  const { tr } = useLang();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [cached, setCached] = useState({ title, message });

  useEffect(() => {
    if (open) {
      setCached({ title, message });
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    if (mounted) {
      setVisible(false);
      const timeout = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [open, title, message, mounted]);

  if (!mounted) return null;

  const messages = Array.isArray(cached.message) ? cached.message : [cached.message];

  return (
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden transform transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
        >
          <i className="fa-solid fa-xmark text-base"></i>
        </button>
        <div className="px-8 pt-8 pb-5 text-center">
          <div className="flex justify-center mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#EF4444,#F59E0B)' }}
            >
              <i className="fa-solid fa-triangle-exclamation text-white text-xl"></i>
            </div>
          </div>
          <h2 className="text-[19px] font-semibold text-gray-900 mb-2 leading-snug">{cached.title ?? tr('Please Check This', 'Pakisuri Ito')}</h2>
          <div className="space-y-1.5">
            {messages.map((line, i) => (
              <p key={i} className="text-[13px] text-gray-500 leading-relaxed">{line}</p>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-100 px-8 py-3 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-semibold hover:underline"
            style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            {tr('Got it', 'Sige')}
          </button>
        </div>
      </div>
    </div>
  );
}
