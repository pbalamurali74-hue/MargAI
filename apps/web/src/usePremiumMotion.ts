import {useEffect} from 'react';
/** Restrained button feedback; decorative only and disabled for reduced motion. */
export function usePremiumMotion(){
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed=false;let burst:any;
    const cleanup=()=>{burst?.stop?.();burst?.timeline?.stop?.();burst?.el?.remove?.();burst=undefined;};
    const setup=async()=>{
      if(preference.matches)return;
      try{const module=await import('@mojs/core');if(disposed||preference.matches)return;
        const mojs=module.default;
        burst=new mojs.Burst({parent:document.body,top:0,left:0,count:5,radius:{5:26},children:{shape:'circle',radius:{3:0},fill:['#70a4ff','#adcfff','#64d9b0'],duration:430,easing:'cubic.out'},isShowStart:false});
        if(burst.el){burst.el.style.pointerEvents='none';burst.el.style.zIndex='500';burst.el.setAttribute('aria-hidden','true');}
      }catch{/* Controls remain functional if decorative animation cannot load. */}
    };
    const onPointer=(event:PointerEvent)=>{if(preference.matches||!burst)return;const target=event.target as HTMLElement;if(!target.closest('button.premium-button,button.premium-button-secondary'))return;burst.tune({x:event.pageX,y:event.pageY}).replay();};
    const preferenceChanged=()=>{cleanup();if(!preference.matches)void setup();};
    void setup();document.addEventListener('pointerdown',onPointer);preference.addEventListener('change',preferenceChanged);
    return()=>{disposed=true;cleanup();document.removeEventListener('pointerdown',onPointer);preference.removeEventListener('change',preferenceChanged);};
  },[]);
}
