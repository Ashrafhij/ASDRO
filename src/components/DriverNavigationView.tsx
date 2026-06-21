'use client';

interface DriverNavigationViewProps {
  instruction: string;
  turnType?: string;
  turnModifier?: string;
  heading?: number;
  nextStep?: { type: string; modifier?: string; instruction: string } | null;
  distance?: number | null;
  isOnline?: boolean;
  onCompass?: () => void;
  onExit?: () => void;
}

function turnArrowSvg(size: number, type: string, modifier?: string): string {
  const angle: Record<string, number> = { left: -90, right: 90, straight: 0, slight_left: -40, slight_right: 40, sharp_left: -135, sharp_right: 135, uturn: 180 };
  if (type === 'roundabout' || type === 'rotary') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M12 3 L8 8 L16 8 Z" fill="#fff"/></svg>`;
  }
  const rot = angle[modifier || ''] ?? 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#fff"><g transform="rotate(${rot}, 12, 12)"><path d="M12 2 L18 10 L14 10 L14 22 L10 22 L10 10 L6 10 Z"/></g></svg>`;
}

export default function DriverNavigationView({
  instruction, turnType, turnModifier, heading, nextStep, distance, isOnline = true, onCompass, onExit,
}: DriverNavigationViewProps) {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Top instruction banner */}
      <div className={`absolute inset-x-4 transition-all duration-300 ${!isOnline ? 'top-16' : 'top-4'}`}>
        <div className="relative pointer-events-auto">
          <div className="bg-[#0f5156] rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0"
              dangerouslySetInnerHTML={{ __html: turnArrowSvg(28, turnType || '', turnModifier) }} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-white leading-tight">{instruction}</p>
            </div>
            {distance !== null && distance !== undefined && distance > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] text-white/50 uppercase tracking-wider">Remaining</p>
                <p className="text-xl font-bold text-white tabular-nums">
                  {distance >= 1000 ? `${(distance / 1000).toFixed(1)}` : `${Math.round(distance)}`}
                </p>
                <p className="text-[10px] text-white/50">{distance >= 1000 ? 'km' : 'm'}</p>
              </div>
            )}
          </div>
          {nextStep && (
            <div className="absolute -bottom-9 left-3 bg-[#0a3d40] rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg">
              <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wide">Then</span>
              <div className="w-4 h-4 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: turnArrowSvg(14, nextStep.type, nextStep.modifier) }} />
              <span className="text-[11px] text-white font-medium truncate max-w-[130px]">{nextStep.instruction}</span>
            </div>
          )}
        </div>
      </div>

      {/* Top-right action buttons */}
      <div className={`absolute right-4 pointer-events-auto flex gap-2 transition-all duration-300 ${!isOnline ? 'top-16' : 'top-4'}`}>
        {onExit && (
          <button onClick={onExit} className="w-10 h-10 bg-white/90 rounded-full shadow-lg flex items-center justify-center backdrop-blur-sm active:scale-90 transition-all">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
        )}
        <button className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-500"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
        </button>
      </div>

      {/* Right-edge action buttons */}
      <div className="absolute bottom-10 right-4 flex flex-col items-center gap-3">
        <button onClick={onCompass} className="pointer-events-auto w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700" style={{ transform: `rotate(${-(heading || 0)}deg)` }}>
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </button>
        <button className="pointer-events-auto w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 0 0 9.5 3C6.08 3 3.28 5.64 3.03 9h2.02C5.3 6.75 7.18 5 9.5 5 11.99 5 14 7.01 14 9.5S11.99 14 9.5 14c-.17 0-.33-.03-.5-.05v2.02c.17.02.33.03.5.03 1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6-7C7.01 7 5 9.01 5 11.5S7.01 16 9.5 16 14 13.99 14 11.5 11.99 7 9.5 7z"/>
          </svg>
        </button>
        <button className="pointer-events-auto w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gray-700">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            <line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-md active:scale-95 transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-yellow-500 shrink-0">
            <path d="M12 2L1 21h22L12 2zm0 3.83L18.28 19H5.72L12 5.83zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z"/>
          </svg>
          <span className="text-xs font-semibold text-gray-700">Report</span>
        </button>
      </div>
    </div>
  );
}
