import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Compass, Eye, MapPin, Radio, RefreshCw, Route, ShieldCheck, Smartphone, AlertTriangle } from 'lucide-react';
import type { Hazard, CivicCase } from '@margai/contracts';
import { TabType } from './Navbar';
import { apiClient } from '../services/apiClient';
import { useI18n } from '../i18n';
import '../home.css';
interface PublicSiteProps {onNavigateTab:(tab:TabType)=>void;selectedLanguage:string;}
export const hazardName = (type: string) => ({pothole:'Road surface',animal:'Animal crossing',pedestrian:'Pedestrian',sharp_curve:'Sharp curve',low_visibility:'Low visibility',collision_risk:'Collision risk',suspected_incident:'Possible incident',confirmed_incident:'Incident'}[type] || 'Road observation');
export const sourceName = (h: Hazard) => h.metadata?.sourceKind === 'seeded_demo' ? 'Sample data' : h.metadata?.inputMode === 'recorded_replay' ? 'Recorded replay' : h.location.provenance === 'simulated' ? 'Simulation' : h.location.provenance === 'surveyed' ? 'Surveyed' : 'Driver observation';

export const PublicSite:React.FC<PublicSiteProps>=({onNavigateTab})=>{
  const {t}=useI18n();
  const [hazards,setHazards]=useState<Hazard[]>([]);
  const [cases,setCases]=useState<CivicCase[]|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(0);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    Promise.allSettled([apiClient.getHazards(),apiClient.getCases()]).then(([h,c])=>{
      if(!active)return;
      const hOk=h.status==='fulfilled'&&Array.isArray(h.value), cOk=c.status==='fulfilled'&&Array.isArray(c.value);
      if(hOk)setHazards(h.value);if(cOk)setCases(c.value);
      setError(!hOk&&!cOk?'The road network is unavailable. Check your connection and try again.':!hOk?'Road observations are unavailable. Reports are still available.':!cOk?'Report totals are unavailable. Road observations are still available.':'');
      setLoading(false);
    });return()=>{active=false;};
  },[revision]);
  const active=hazards[selected]||hazards[0];
  return <div className="overview">
    <section className="overview-hero page-width">
      <div className="overview-copy"><div className="edition"><span className="edition-mark"/>ROAD INTELLIGENCE, SHARED.</div>
        <h1>{t('A little foresight.')}<br/><span>{t('A better journey.')}</span></h1>
        <p className="hero-description">{t('The road ahead is a shared responsibility. Turn what one driver sees into a heads-up for everyone behind.')}</p>
        <div className="hero-actions"><button className="premium-button" onClick={()=>onNavigateTab('live')}>{t('Explore the network')}<ArrowUpRight size={18}/></button><button className="text-button" onClick={()=>onNavigateTab('journey')}>{t('Try a drive')}<ArrowRight size={16}/></button></div>
        <div className="hero-footnote"><Smartphone size={16}/><span>{t('Your phone. A clearer road ahead.')}</span></div>
      </div>
      <div className="corridor-panel">
        <div className="corridor-toolbar"><span><i/>BENGALURU / ORR</span><span>01 — CORRIDOR VIEW</span></div>
        <svg className="corridor-drawing" viewBox="0 0 660 470" role="img" aria-label="Schematic of Bengaluru Outer Ring Road between Kadubeesanahalli and Bellandur. Not for navigation.">
          <defs><pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#ffffff" strokeOpacity=".045"/></pattern></defs>
          <rect width="660" height="470" fill="url(#map-grid)"/>
          <g fill="#262c26" stroke="#394137" strokeWidth="1"><path d="m28 80 125-36 40 88-125 37Z"/><path d="m79 188 129-40 49 103-140 47Z"/><path d="m141 320 131-43 53 94-135 53Z"/><path d="m344 42 82-34 60 111-78 45Z"/><path d="m438 166 122-47 71 113-133 57Z"/><path d="m509 314 113-37 38 111-113 49Z"/><path d="m287 397 109-47 33 71-105 49Z"/></g>
          <g fill="none" stroke="#4a5145" strokeWidth="1.5"><path d="M-30 187 206 103 347 70 557-10M-20 342 232 245 438 166 697 61M135 500 287 397 509 314 681 249M29-30 79 80 141 188 198 320 250 500M506-20 560 119 631 232 690 418"/><path d="M-10 238 229 150 443 65M51 407 274 319 515 225 660 184" strokeWidth="5" stroke="#30382f"/></g>
          <path d="M254-30 280 40 290 95 325 143 346 195 375 238 395 291 437 338 467 409 494 492" fill="none" stroke="#111811" strokeWidth="34"/>
          <path d="M254-30 280 40 290 95 325 143 346 195 375 238 395 291 437 338 467 409 494 492" fill="none" stroke="#515b48" strokeWidth="25"/>
          <path d="M254-30 280 40 290 95 325 143 346 195 375 238 395 291 437 338 467 409 494 492" fill="none" stroke="#d5df8c" strokeWidth="2" strokeDasharray="5 7"/>
          <path d="m280 40 10 55 35 48 21 52 29 43 20 53 42 47 30 71" fill="none" stroke="#d7ef86" strokeWidth="4" transform="translate(-8 3)"/>
          <g fontFamily="inherit" fontSize="10" fill="#8b9684" letterSpacing="1.3"><text x="70" y="120">KADUBEESANAHALLI</text><text x="450" y="95">PANATHUR</text><text x="138" y="358">BELLANDUR</text><text x="492" y="364">ECOSPACE</text><text x="348" y="110" transform="rotate(62 348 110)">OUTER RING ROAD</text></g>
          <g transform="translate(337 195)"><circle r="24" fill="#d7ef86" fillOpacity=".08"/><circle r="14" fill="#d7ef86" fillOpacity=".12"/><circle r="5" fill="#d7ef86"/><path d="M12 0h38" stroke="#d7ef86" strokeWidth="1"/><rect x="50" y="-18" width="146" height="36" rx="3" fill="#e6edcf"/><text x="63" y="4" fill="#273022" fontFamily="inherit" fontSize="10" fontWeight="600">CORRIDOR OBSERVATIONS</text></g>
          <g transform="translate(386 291) rotate(-26)"><rect x="-6" y="-12" width="12" height="24" rx="3" fill="#e7e9df"/><rect x="-4" y="-6" width="8" height="7" rx="1" fill="#66725a"/></g>
          <g transform="translate(282 88)"><circle r="4" fill="#e6edcf"/><circle r="10" fill="none" stroke="#e6edcf" strokeOpacity=".3"/></g>
        </svg>
        <div className="map-compass"><Compass size={22}/><span>N</span></div>
        <div className="corridor-bottom"><div><span className="micro-label">{t('A connected stretch')}</span><strong>Kadubeesanahalli → Bellandur</strong></div><button aria-label={t('Open road network')} onClick={()=>onNavigateTab('live')}><ArrowUpRight size={20}/></button></div>
        <span className="schematic-label">{t('CORRIDOR SCHEMATIC · NOT FOR NAVIGATION')}</span>
      </div>
    </section>
    <section className="network-strip page-width" aria-label={t('Network summary')}>
      <div className="network-intro"><Radio size={19}/><div><strong>{t('The road, in perspective.')}</strong><span>{t('Current records from the network')}</span></div></div>
      <div className="network-number"><strong>{loading?'—':error.startsWith('The road')?'—':hazards.length.toString().padStart(2,'0')}</strong><span>{t('Active observations')}</span></div>
      <div className="network-number"><strong>{loading||cases===null?'—':cases.length.toString().padStart(2,'0')}</strong><span>{t('Road reports')}</span></div>
      <div className="network-number"><strong>01</strong><span>{t('Demo corridor')}</span></div>
      <button className="strip-action" aria-label={t('See how the network works')} onClick={()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ArrowDown size={20}/></button>
    </section>
    <section className="observations page-width">
      <div className="section-top"><div><span className="eyebrow">01 / ON THE RADAR</span><h2>{t('A closer look at the road.')}</h2></div><button className="text-button" onClick={()=>onNavigateTab('civic')}>{t('View road reports')}<ArrowUpRight size={17}/></button></div>
      {error&&<div className="inline-message" role="alert"><AlertTriangle size={18}/><span>{t(error)}</span><button onClick={()=>setRevision(x=>x+1)}><RefreshCw size={15}/>{t('Try again')}</button></div>}
      {loading?<div className="observation-placeholder" role="status">{t('Reading road observations…')}</div>:hazards.length?<div className="observation-grid"><div className="observation-table"><div className="observation-table-head"><span>{t('OBSERVATION / LOCATION')}</span><span>{t('SOURCE')}</span><span>{t('STATUS')}</span></div>{hazards.slice(0,5).map((h,i)=><button className={`observation-row ${selected===i?'selected':''}`} key={h.id} onClick={()=>setSelected(i)} aria-pressed={selected===i}><span className="observation-main"><span className={`observation-icon ${h.type==='pothole'?'amber':''}`}>{h.type==='sharp_curve'?<Route size={20}/>:<AlertTriangle size={19}/>}</span><span><strong>{t(hazardName(h.type))}</strong><small>{h.roadReference.roadName}</small></span></span><span className="data-source">{t(sourceName(h))}</span><span className="observation-status"><i/>{t(h.verificationState==='corroborated'?'Corroborated':'In review')}</span></button>)}</div><aside className="observation-detail"><div className="detail-top"><MapPin size={18}/><span>{t('OBSERVATION DETAILS')}</span><span>{String(selected+1).padStart(2,'0')}</span></div><h3>{active?.roadReference.roadName}</h3><p>{active&&t(hazardName(active.type))} · {active&&t(sourceName(active))}</p><div className="detail-coordinates">{active?.location.latitude.toFixed(5)}° N<br/>{active?.location.longitude.toFixed(5)}° E</div><button className="text-button" onClick={()=>onNavigateTab('live')}>{t('Locate on the network')}<ArrowUpRight size={16}/></button></aside></div>:!error&&<div className="empty-state"><Route size={28}/><h3>{t('A quiet road, for now.')}</h3><p>{t('There are no active observations. Take the drive demo to see how a report travels.')}</p><button className="premium-button-secondary" onClick={()=>onNavigateTab('journey')}>{t('Try a drive')}<ArrowRight size={16}/></button></div>}
      <p className="data-note">{t('Sample and simulated observations are labelled. Road conditions can change; always follow the road in front of you.')}</p>
    </section>
    <section id="how-it-works" className="workflow-section"><div className="page-width"><div className="section-top"><div><span className="eyebrow">02 / THE BIGGER PICTURE</span><h2>{t('One observation. A shared advantage.')}</h2></div><p>{t('From the first sighting to a reviewable road report.')}</p></div><div className="workflow-grid">{[{icon:Eye,num:'01',title:'See it first.',copy:'A mounted phone spots an observation. Detection stays on the device.'},{icon:Radio,num:'02',title:'Pass it on.',copy:'The relay shares a relevant warning with drivers approaching the same road.'},{icon:ShieldCheck,num:'03',title:'Make it count.',copy:'Repeat observations become a road report with an evidence trail to review.'}].map(s=><article key={s.num}><div className="workflow-index"><s.icon size={22}/><span>{s.num}</span></div><h3>{t(s.title)}</h3><p>{t(s.copy)}</p></article>)}</div><div className="workflow-footer"><span>BUILT WITH GOOGLE TECHNOLOGY</span><div>Gemini <i/> Cloud Run <i/> Maps <i/> On-device vision</div></div></div></section>
  </div>;
};
