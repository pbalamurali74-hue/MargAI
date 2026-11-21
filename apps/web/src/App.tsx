import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrandMark, Navbar, TabType, VIEWS } from './components/Navbar';
import { PublicSite } from './components/PublicSite';
import { apiClient } from './services/apiClient';
import {I18nProvider,isUiLanguage,translate,useI18n} from './i18n';

const SmartphoneDashcam = lazy(() => import('./components/SmartphoneDashcam').then(module => ({ default: module.SmartphoneDashcam })));
const InCarDisplay = lazy(() => import('./components/InCarDisplay').then(module => ({ default: module.InCarDisplay })));
const CivicDashboard = lazy(() => import('./components/CivicDashboard').then(module => ({ default: module.CivicDashboard })));
const GoogleStackInspector = lazy(() => import('./components/GoogleStackInspector').then(module => ({ default: module.GoogleStackInspector })));

const LiveMap = lazy(() => import('./components/LiveMap').then(module => ({ default: module.LiveMap })));
const DriveMap = lazy(() => import('./components/DriveMap').then(module => ({ default: module.DriveMap })));
function readView(): TabType {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (VIEWS.some(item => item.id === view)) return view as TabType;
  if (/smartphone|phone/.test(window.location.search)) return 'smartphone';
  if (/in-car|cockpit|infotainment/.test(window.location.search)) return 'in-car';
  return 'public';
}
export const App: React.FC = () => {

  const [currentTab, setCurrentTab] = useState<TabType>(readView);
  const [selectedLanguage, setSelectedLanguage] = useState(() => { try { const saved=localStorage.getItem('margai-language')||'en'; return isUiLanguage(saved)?saved:'en'; } catch { return 'en'; } });
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const navigate = (tab: TabType) => {
    const url = new URL(window.location.href); const keep = url.searchParams.get('code'); url.search = ''; if (tab === 'car' && keep) url.searchParams.set('code', keep);
    if (tab !== 'public') url.searchParams.set('view', tab);
    if (tab !== currentTab) window.history.pushState({}, '', url);
    setCurrentTab(tab); window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => { const onPopState = () => setCurrentTab(readView()); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, []);
  useEffect(() => { document.title = `${translate(selectedLanguage,VIEWS.find(item => item.id === currentTab)?.label || 'Home')} · MargAI`; document.documentElement.lang=selectedLanguage; }, [currentTab,selectedLanguage]);
  useEffect(() => { try { localStorage.setItem('margai-language', selectedLanguage); } catch { /* Optional storage. */ } }, [selectedLanguage]);
  useEffect(() => {
    if (location.hostname.endsWith('github.io') && !import.meta.env.VITE_API_ORIGIN) return;
    let active = true;
    const checkHealth = async () => { try { const result = await apiClient.getHealth(); if (active) setIsBackendConnected(result.status === 'ok'); } catch { if (active) setIsBackendConnected(false); } };
    checkHealth(); const interval = window.setInterval(checkHealth, 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return <I18nProvider language={selectedLanguage}><div className="app-shell">
    <a href="#main-content" className="skip-link">{translate(selectedLanguage,'Skip to content')}</a>
    <Navbar currentTab={currentTab} onSelectTab={navigate} selectedLanguage={selectedLanguage} onSelectLanguage={language=>{if(isUiLanguage(language))setSelectedLanguage(language);}} isBackendConnected={isBackendConnected}/>
    <main id="main-content" className={currentTab === 'public' ? 'main-content' : 'main-content workspace-view'} tabIndex={-1}><Suspense fallback={<div className="view-loading" role="status"><span className="loading-road"/>{translate(selectedLanguage,'Loading…')}</div>}>
      {currentTab === 'public' && <PublicSite onNavigateTab={navigate} selectedLanguage={selectedLanguage}/>}
      {currentTab === 'command-center' && <DriveMap onNavigate={navigate}/>}
      {currentTab === 'in-car' && <div className="road-showcase"><InCarDisplay/></div>}
      {currentTab === 'live' && <LiveMap mode="observer" onNavigate={navigate}/>}
      {currentTab === 'car' && <LiveMap mode="car" onNavigate={navigate}/>}
      {currentTab === 'app' && <SmartphoneDashcam/>}
      {currentTab === 'smartphone' && <div className="camera-showcase"><SmartphoneDashcam/></div>}
      {currentTab === 'journey' && <DriveMap onNavigate={navigate}/>}
      {currentTab === 'driver' && <DriveMap onNavigate={navigate}/>}
      {currentTab === 'deck' && <PublicSite onNavigateTab={navigate} selectedLanguage={selectedLanguage}/>}
      {currentTab === 'civic' && <CivicDashboard/>}
      {currentTab === 'google-stack' && <GoogleStackInspector/>}
    </Suspense></main>
    <SimpleFooter onNavigate={navigate}/>
  </div></I18nProvider>;
};
function SimpleFooter({onNavigate}:{onNavigate:(view:TabType)=>void}){
  const {t}=useI18n();
  return <footer className="site-footer"><div className="footer-inner"><BrandMark/><span>{t('Shared awareness. Better journeys.')}</span><span className="footer-tech">{t('Built with Google technology')}</span></div></footer>;
}

export default App;
