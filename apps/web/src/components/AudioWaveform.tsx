import React, { useEffect, useState } from 'react';
interface AudioWaveformProps { isActive: boolean; barCount?: number; className?: string; label?: string; }
/** A visual state indicator, not an analysis of microphone or Gemini audio. */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({ isActive, barCount = 24, className = '', label = 'Warning audio' }) => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!isActive || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setPhase(value => value + .65), 180);
    return () => window.clearInterval(timer);
  }, [isActive]);
  return <div className={`rounded-xl border border-[#26312d] bg-[#0c130e] p-4 ${className}`}><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-[#b7c8b3]">{label}</span><span className="text-[#7f947d]">{isActive ? 'Browser audio · illustration' : 'Ready for a warning'}</span></div><div className="flex h-10 items-center justify-between gap-1" role="img" aria-label={isActive ? 'Illustrative active audio waveform' : 'Audio standby indicator'}>{Array.from({length:barCount},(_,index) => <span key={index} className="block w-full rounded-full transition-[height] duration-150" style={{height:isActive ? `${18 + Math.abs(Math.sin(index * .75 + phase)) * 72}%` : '12%',background:isActive ? '#d7ff69' : '#334330',opacity:isActive ? .5 + (index % 3) * .2 : .8}}/>)}</div></div>;
};
