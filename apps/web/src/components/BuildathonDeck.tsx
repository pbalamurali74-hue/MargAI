import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Route } from 'lucide-react';
import { useI18n } from '../i18n';

interface BuildathonDeckProps { onLaunchHUD?: () => void }

export const BuildathonDeck: React.FC<BuildathonDeckProps> = ({ onLaunchHUD }) => {
  const { t } = useI18n();
  const [currentSlide, setCurrentSlide] = useState(1);
  const totalSlides = 4;
  const nextSlide = () => setCurrentSlide(slide => slide === totalSlides ? 1 : slide + 1);
  const prevSlide = () => setCurrentSlide(slide => slide === 1 ? totalSlides : slide - 1);
  const chapters = [t('The idea'), t('How it works'), t('The technology'), t('The next step')];

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); setCurrentSlide(slide => slide === totalSlides ? 1 : slide + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCurrentSlide(slide => slide === 1 ? totalSlides : slide - 1); }
      if (event.key === 'Home') { event.preventDefault(); setCurrentSlide(1); }
      if (event.key === 'End') { event.preventDefault(); setCurrentSlide(totalSlides); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="premium-page pb-10 text-[#17263e]">
      <header className="mb-6"><p className="eyebrow mb-3 text-[#2563eb]">{t('The MargAI story')}</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.04em]">{t('A little more awareness.')}</h1></header>
      <section aria-label={t('MargAI presentation')} className="overflow-hidden rounded-[2rem] border border-[#dce5f2] bg-white shadow-[0_22px_65px_-38px_rgba(47,76,134,0.35),0_2px_3px_rgba(47,76,134,0.04)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#e7edf7] px-6 sm:px-10 py-5"><span className="text-sm text-[#67788f]">{chapters[currentSlide - 1]}</span><span className="text-sm text-[#67788f] tabular-nums">{t('Slide {current} of {total}', { current: currentSlide, total: totalSlides })}</span></div>
        <div className="flex min-h-[430px] sm:min-h-[490px] flex-col justify-center p-6 sm:p-10 xl:p-14" aria-live="polite" aria-atomic="true">
          {currentSlide === 1 && <div className="max-w-3xl">
            <span className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dce5f2] bg-[#f5f8ff] text-[#2563eb] shadow-[inset_0_2px_0_#fff,0_6px_12px_-8px_#9aaed2]"><Route size={28} strokeWidth={1.5} aria-hidden="true" /></span>
            <h2 className="text-4xl sm:text-5xl xl:text-6xl leading-[1.08] tracking-[-0.055em] font-semibold text-[#17263e]">{t('See the road ahead.')}<br /><span className="text-[#2563eb]">{t('Help the driver behind.')}</span></h2><p className="mt-6 max-w-xl text-lg leading-8 text-[#67788f]">{t('Road observations become useful warnings and better civic reports.')}</p>
          </div>}
          {currentSlide === 2 && <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.045em] text-[#17263e]">{t('One observation. More awareness.')}</h2>
            <div className="mt-8 grid md:grid-cols-3 gap-4">{[
              { title: t('Observe'), text: t('A camera or recorded journey identifies a potential road hazard.') },
              { title: t('Warn'), text: t('Road direction and freshness help select the relevant warning.') },
              { title: t('Report'), text: t('Related observations become one case for review and follow-up.') },
            ].map(item => <article key={item.title} className="rounded-3xl border border-[#e0e8f5] bg-[#f5f8ff] p-6 shadow-[inset_0_2px_0_#fff]"><h3 className="text-xl font-semibold text-[#2563eb]">{item.title}</h3><p className="mt-3 text-base leading-7 text-[#67788f]">{item.text}</p></article>)}</div>
          </div>}
          {currentSlide === 3 && <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.045em] text-[#17263e]">{t('A connected foundation.')}</h2><p className="mt-4 max-w-xl text-base leading-7 text-[#67788f]">{t('Google technology supports the architecture. Each integration has its own setup and validation stage.')}</p>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[
              { name: 'Gemini', role: t('Helpful report drafts') },
              { name: 'Cloud Run', role: t('Backend deployment') },
              { name: 'Firestore', role: t('Shared road records') },
              { name: 'Google Maps', role: t('Route context') },
              { name: 'LiteRT', role: t('Planned mobile inference') },
              { name: 'Android Auto', role: t('Planned car display') },
            ].map(item => <div key={item.name} className="rounded-2xl border border-[#e0e8f5] bg-[#f5f8ff] p-5"><p className="text-lg font-semibold text-[#17263e]">{item.name}</p><p className="mt-2 text-sm text-[#67788f]">{item.role}</p></div>)}</div>
          </div>}
          {currentSlide === 4 && <div className="max-w-3xl">
            <h2 className="text-4xl sm:text-5xl xl:text-6xl leading-[1.08] tracking-[-0.055em] font-semibold text-[#17263e]">{t('Start with a journey.')}<br /><span className="text-[#2563eb]">{t('Build a better road.')}</span></h2><p className="mt-6 max-w-xl text-lg leading-8 text-[#67788f]">{t('Explore the prototype, follow a warning, and see how the evidence becomes a civic case.')}</p>
            {onLaunchHUD && <button type="button" onClick={onLaunchHUD} className="premium-button mt-7"><Play size={16} aria-hidden="true" />{t('Try MargAI')}</button>}
          </div>}
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-[#e7edf7] px-6 sm:px-10 py-5"><a href="https://startupbuildathon.com/" target="_blank" rel="noreferrer" className="text-xs sm:text-sm text-[#67788f] hover:text-[#2563eb]">{t('Independent buildathon project')}</a><div className="flex items-center gap-2"><button type="button" onClick={prevSlide} aria-label={t('Previous slide')} className="grid h-11 w-11 place-items-center rounded-2xl border border-[#dce5f2] bg-[#f5f8ff] text-[#17263e] shadow-[0_4px_9px_-7px_#9aaed2] hover:border-[#2563eb]"><ChevronLeft size={20} aria-hidden="true" /></button><button type="button" onClick={nextSlide} aria-label={t('Next slide')} className="grid h-11 w-11 place-items-center rounded-2xl border border-[#dce5f2] bg-[#f5f8ff] text-[#17263e] shadow-[0_4px_9px_-7px_#9aaed2] hover:border-[#2563eb]"><ChevronRight size={20} aria-hidden="true" /></button></div></footer>
      </section>
    </div>
  );
};
