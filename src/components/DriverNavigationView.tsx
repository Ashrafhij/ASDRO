'use client';

interface DriverNavigationViewProps {
  heading?: number;
  isOnline?: boolean;
  onCompass?: () => void;
  onExit?: () => void;
}

export default function DriverNavigationView({
  heading, isOnline = true, onCompass, onExit,
}: DriverNavigationViewProps) {
  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Back button (top-left, below green banner at top-36) */}
      <div className="absolute left-4 pointer-events-auto transition-all duration-300" style={{ top: '144px' }}>
        {onExit && (
          <button onClick={onExit} className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center active:scale-90 transition-all">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
        )}
      </div>

      {/* Sparkle button (top-right) */}
      <div className="absolute right-4 pointer-events-auto" style={{ top: '144px' }}>
        <button className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
        </button>
      </div>

      {/* Right-edge action buttons (above bottom sheet) */}
      <div className="absolute flex flex-col items-center gap-3 pointer-events-auto" style={{ bottom: 'calc(15vh + 20px)', right: '16px' }}>
        <button onClick={onCompass} className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700" style={{ transform: `rotate(${-(heading || 0)}deg)` }}>
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </button>
        <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 0 0 9.5 3C6.08 3 3.28 5.64 3.03 9h2.02C5.3 6.75 7.18 5 9.5 5 11.99 5 14 7.01 14 9.5S11.99 14 9.5 14c-.17 0-.33-.03-.5-.05v2.02c.17.02.33.03.5.03 1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6-7C7.01 7 5 9.01 5 11.5S7.01 16 9.5 16 14 13.99 14 11.5 11.99 7 9.5 7z"/>
          </svg>
        </button>
        <button className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            <line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-md active:scale-95 transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-yellow-500 shrink-0">
            <path d="M12 2L1 21h22L12 2zm0 3.83L18.28 19H5.72L12 5.83zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z"/>
          </svg>
          <span className="text-xs font-semibold text-gray-700">Report</span>
        </button>
      </div>
    </div>
  );
}
