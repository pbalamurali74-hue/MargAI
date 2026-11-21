import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, Globe2, Menu, X } from 'lucide-react';
import { UI_LANGUAGES, useI18n } from '../i18n';
export type TabType = 'journey' | 'live' | 'app' | 'car' | 'command-center' | 'in-car' | 'smartphone' | 'driver' | 'deck' | 'civic' | 'google-stack' | 'public';
export const VIEWS: {id:TabType;label:string}[] = [
  {id:'public',label:'Overview'},{id:'in-car',label:'Road showcase'},{id:'smartphone',label:'Live camera'},{id:'journey',label:'Drive demo'},{id:'civic',label:'Road reports'},
  {id:'live',label:'Road network'},{id:'app',label:'Driver app'},{id:'car',label:'Car display'},{id:'command-center',label:'Drive studio'},
  {id:'driver',label:'Scenarios'},{id:'google-stack',label:'System status'},{id:'deck',label:'Our story'},
];
export const BrandMark=({compact=false}:{compact?:boolean})=><span className="brand-lockup"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M6 25 13 7h6l7 18h-6l-4-11-4 11H6Z" fill="currentColor"/><path d="M16 22v7" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2"/></svg></span>{!compact&&<span className="brand-wordmark">marg<span>ai</span></span>}</span>;
interface NavbarProps {currentTab:TabType;onSelectTab:(tab:TabType)=>void;selectedLanguage:string;onSelectLanguage:(language:string)=>void;isBackendConnected:boolean;}
export const Navbar:React.FC<NavbarProps>=({currentTab,onSelectTab,selectedLanguage,onSelectLanguage,isBackendConnected})=>{
  const {t}=useI18n();
  const [menuOpen,setMenuOpen]=useState(false);
  const go=(view:TabType)=>{onSelectTab(view);setMenuOpen(false);};
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenuOpen(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  return <header className="site-header"><div className="header-inner">
    <button className="brand-button" aria-label={t('MargAI home')} onClick={()=>go('public')}><BrandMark/></button>
    <nav className="desktop-nav" aria-label={t('Main navigation')}>{VIEWS.slice(0,5).map(view=><button key={view.id} onClick={()=>go(view.id)} aria-current={currentTab===view.id?'page':undefined} className={`nav-link ${currentTab===view.id?'is-active':''}`}>{t(view.label)}</button>)}</nav>
    <div className="header-actions"><button className={`network-status ${isBackendConnected?'connected':''}`} onClick={()=>go('google-stack')} title={t('System status')}><i/>{isBackendConnected?t('Network online'):location.hostname.endsWith('github.io')&&!import.meta.env.VITE_API_ORIGIN?t('On-device mode'):t('API offline')}</button>
    <label className="language-control"><Globe2 size={15}/><select aria-label={t('Website language')} value={selectedLanguage} onChange={event=>onSelectLanguage(event.target.value)}>{UI_LANGUAGES.map(language=><option key={language.code} value={language.code}>{language.nativeName}</option>)}</select><ChevronDown size={12}/></label>
    <button className="nav-drive" onClick={()=>go('app')}>{t('Start driving')}<ArrowUpRight size={16}/></button>
    <button className="mobile-menu-button" aria-label={t(menuOpen?'Close navigation':'Open navigation')} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={22}/>:<Menu size={22}/>}</button></div></div>
    {menuOpen&&<nav id="mobile-navigation" className="mobile-navigation" aria-label={t('Main navigation')}>{[...VIEWS.slice(0,5),VIEWS[10]].map(view=><button key={view.id} onClick={()=>go(view.id)} aria-current={currentTab===view.id?'page':undefined}>{t(view.label)}<ArrowUpRight size={16}/></button>)}</nav>}
  </header>;
};
