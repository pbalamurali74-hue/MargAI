import {PhoneLocationMap} from './PhoneLocationMap';
import type {GPSFix,Telemetry} from '../mobile/telemetry';
import {readPhoneTelemetry} from '../mobile/phoneReadings';
import {RoadPhoneSensors} from './RoadPhoneSensors';
import '../mobile.css';
import {createPortal} from 'react-dom';
import QRCode from 'qrcode';
import { apiClient } from '../services/apiClient';
import { LiveRelay } from '../live/relay';
import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Compass,
  Radio,
  Smartphone,
  QrCode,
  ExternalLink,
  X,
  AlertTriangle,
  Navigation,
  Phone,
  MessageSquare,
  Music,
  Mic,
  Sliders,
  Grid,
  Wifi,
  Battery,
  Car,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Camera,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import Peer from 'peerjs';
import { SUPPORTED_LANGUAGES, audioSynthesizer } from '@margai/localization';
import {
  loadDetectionModel,
  detectHazards,
  startGeoTracking,
  stopGeoTracking,
  getCurrentPosition,
  type DetectedHazard,
} from '../services/hazardDetector';

interface HazardItem {
  id: string;
  key: string;
  distance: number;
  n: number;
  alerted: boolean;
  confirmed?: boolean;
  bbox?: [number, number, number, number];
  confidence?: number;
  label?: string;
  geo?: { lat: number; lng: number; accuracy?: number };
}

interface LanguageCatalog {
  [key: string]: {
    name: string;
    hazardPhrases: {
      walker: string;
      pothole: string;
      curve: string;
      fog: string;
      side: string;
      animal: string;
      waterlogging: string;
    };
  };
}

const LOCALIZED_CATALOG: LanguageCatalog = {
  en: {
    name: 'English',
    hazardPhrases: {
      walker: 'Person crossing ahead. Brake gently.',
      pothole: 'Pothole ahead. Slow down.',
      curve: 'Sharp curve ahead.',
      fog: 'Low visibility. Drive slowly.',
      side: 'Person at roadside.',
      animal: 'Stray cattle crossing ahead. Brake gently.',
      waterlogging: 'Flooded road ahead. Reduce speed and test brakes.',
    },
  },
  hi: {
    name: 'हिन्दी',
    hazardPhrases: {
      walker: 'आगे कोई सड़क पार कर रहा है। सावधान।',
      pothole: 'आगे गड्ढा है। गति धीमी करें।',
      curve: 'आगे तीखा मोड़ है।',
      fog: 'कम दृश्यता है। धीरे चलें।',
      side: 'सड़क किनारे व्यक्ति खड़ा है।',
      animal: 'आगे सड़क पर पशु हैं। सावधानी से ब्रेक लगाएं।',
      waterlogging: 'आगे सड़क पर जलभराव है। गति धीमी करें।',
    },
  },
  ta: {
    name: 'தமிழ்',
    hazardPhrases: {
      walker: 'முன்னே ஒருவர் சாலையைக் கடக்கிறார். கவனம்.',
      pothole: 'முன்னே குழி உள்ளது. வேகத்தைக் குறையுங்கள்.',
      curve: 'முன்னே கூர்மையான வளைவு உள்ளது.',
      fog: 'பார்வைத் தெளிவு குறைவு. மெதுவாகச் செல்லுங்கள்.',
      side: 'சாலையோரத்தில் ஒருவர் நிற்கிறார்.',
      animal: 'முன்னே கால்நடைகள் சாலையைக் கடக்கின்றன. கவனம்.',
      waterlogging: 'முன்னே சாலையில் நீர் தேங்கியுள்ளது. கவனம்.',
    },
  },
  te: {
    name: 'తెలుగు',
    hazardPhrases: {
      walker: 'ముందు ఒకరు రోడ్డు దాటుతున్నారు. నెమ్మదిగా బ్రేక్ వేయండి.',
      pothole: 'ముందు గుంత ఉంది. వేగం తగ్గించండి.',
      curve: 'ముందు పదునైన మలుపు ఉంది.',
      fog: 'కనిపించే దూరం తక్కువగా ఉంది. నెమ్మదిగా వెళ్లండి.',
      side: 'రోడ్డు పక్కన వ్యక్తి ఉన్నారు.',
      animal: 'ముందు పశువులు రోడ్డు దాటుతున్నాయి. నెమ్మదిగా వెళ్లండి.',
      waterlogging: 'ముందు రోడ్డుపై నీరు నిలిచింది. నెమ్మదిగా వెళ్లండి.',
    },
  },
  kn: {
    name: 'ಕನ್ನಡ',
    hazardPhrases: {
      walker: 'ಮುಂದೆ ಒಬ್ಬರು ರಸ್ತೆ ದಾಟುತ್ತಿದ್ದಾರೆ. ನಿಧಾನವಾಗಿ ಬ್ರೇಕ್ ಹಾಕಿ.',
      pothole: 'ಮುಂದೆ ಗುಂಡಿ ಇದೆ. ವೇಗ ಕಡಿಮೆ ಮಾಡಿ.',
      curve: 'ಮುಂದೆ ತೀಕ್ಷ್ಣ ತಿರುವು ಇದೆ.',
      fog: 'ಗೋಚರತೆ ಕಡಿಮೆ ಇದೆ. ನಿಧಾನವಾಗಿ ಚಲಿಸಿ.',
      side: 'ರಸ್ತೆ ಬದಿಯಲ್ಲಿ ವ್ಯಕ್ತಿ ಇದ್ದಾರೆ.',
      animal: 'ಮುಂದೆ ದನ-ಕರುಗಳು ರಸ್ತೆ ದಾಟುತ್ತಿವೆ. ಎಚ್ಚರಿಕೆಯಿಂದ ಚಲಿಸಿ.',
      waterlogging: 'ಮುಂದೆ ರಸ್ತೆಯಲ್ಲಿ ನೀರು ನಿಂತಿದೆ. ಎಚ್ಚರ.',
    },
  },
};

const HAZARD_SPECS: Record<
  string,
  { ic: string; lv: number; n: string; r: string; quiet?: boolean; civic?: boolean }
> = {
  pothole: { ic: '🕳️', lv: 2, n: 'Pothole', r: 'In your lane', civic: true },
  walker: { ic: '🚶', lv: 3, n: 'Pedestrian', r: 'Crossing toward lane' },
  animal: { ic: '🐄', lv: 3, n: 'Animal', r: 'Crossing road ahead' },
  waterlogging: { ic: '🌊', lv: 2, n: 'Waterlogging', r: 'Flooded road surface', civic: true },
  curve: { ic: '↪️', lv: 1, n: 'Sharp turn', r: 'On your route' },
  fog: { ic: '🌫️', lv: 2, n: 'Low visibility', r: 'Ahead on road' },
  side: { ic: '🧍', lv: 0, n: 'Person at roadside', r: 'Near shoulder', quiet: true },
};

const HAS_ROAD_API = !location.hostname.endsWith('github.io') || Boolean(import.meta.env.VITE_API_ORIGIN);

export const InCarDisplay: React.FC = () => {
  const [hostedPhone, setHostedPhone] = useState(Boolean(import.meta.env.VITE_PHONE_APP_ORIGIN) || location.hostname.endsWith('github.io'));
  const [hostedPhoneOrigin, setHostedPhoneOrigin] = useState(import.meta.env.VITE_PHONE_APP_ORIGIN || (location.hostname.endsWith('github.io') ? location.origin + location.pathname : ''));
  const [phoneOrigin, setPhoneOrigin] = useState('');
  const [pairQr, setPairQr] = useState('');
  useEffect(() => { if (!HAS_ROAD_API) return; void apiClient.getConfig().then(config => { if (config.phoneWebOrigin) setPhoneOrigin(config.phoneWebOrigin); }).catch(() => {}); }, []);
  // Vehicle Telemetry
  const [vehicleSpeed, setVehicleSpeed] = useState<number>(90);
  const [roadCurveType, setRoadCurveType] = useState<string>('STRAIGHT');
  const [zAccelG, setZAccelG] = useState<number>(1.02);
  const [isBumpActive, setIsBumpActive] = useState<boolean>(false);
  const [clockStr, setClockStr] = useState<string>('12:30');
  const [currentLang, setCurrentLang] = useState<string>('ta');
  const [muted, setMuted] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Prototype Visual Scenarios (Matching Slide 10 panels 2, 3, 4)
  const [activeScenario, setActiveScenario] = useState<'urgent' | 'vernacular' | 'cleared'>('cleared');
  // Left View Mode: 'camera' (Slide 10.3) vs 'road' (Slide 10.2)
  const [leftViewMode, setLeftViewMode] = useState<'camera' | 'road'>('camera');

  // Phone Cam Streams: Direct MediaStream or Base64 Frames
  const [peerId,setPeerId] = useState<string>(() => {
    try { const saved=sessionStorage.getItem('margai.display.id');if(saved&&/^margai-[A-Za-z0-9]{4,8}$/.test(saved))return saved; } catch {}
    const id=`margai-${Math.floor(1000 + Math.random() * 9000)}`;try{sessionStorage.setItem('margai.display.id',id);}catch{}return id;
  });
  const [verifiedPeerId, setVerifiedPeerId] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isWebRtcConnected, setIsWebRtcConnected] = useState<boolean>(false);
  const [phoneCameraB64, setPhoneCameraB64] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [feedClock, setFeedClock] = useState(Date.now());
  const lastImageAt = useRef(0), lastVideoAt = useRef(0), lastVideoTime = useRef(-1), phoneInferenceUntil = useRef(0);
  const packetReceiver = useRef<(data:any)=>void>(()=>{});
  const [phoneTelemetry, setPhoneTelemetry] = useState<{gps:GPSFix|null;speedKmh:number|null;heading:number|null;gForce:number|null}|null>(null);
  const [phoneSensors,setPhoneSensors]=useState<Telemetry|null>(null);
  const [sensorReceivedAt,setSensorReceivedAt]=useState(0);
  const [showPairModal, setShowPairModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Active Hazards Queue — Empty by default, populated ONLY when hazards come in sight
  const [hazards, setHazards] = useState<HazardItem[]>([]);
  const [activeGeo, setActiveGeo] = useState<{ lat: number; lng: number }>({ lat: 12.9716, lng: 77.5946 });
  const [isMlDetecting, setIsMlDetecting] = useState<boolean>(false);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mlLoopRef = useRef<number | null>(null);
  const lastAlertTimeRef = useRef<number>(0);

  const [noteText, setNoteText] = useState<{ text: string; until: number }>({
    text: '',
    until: 0,
  });

  const lastHazardStateUpdateRef = useRef<number>(0);
  const lastLoopTimeRef = useRef<number>(performance.now());
  const mapDistanceRef = useRef<number>(1420);
  const vehicleSpeedRef = useRef<number>(vehicleSpeed);
  const toastTimerRef = useRef<any>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  vehicleSpeedRef.current = vehicleSpeed;

  // Clock Update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const mins = now.getMinutes().toString().padStart(2, '0');
      hours = hours % 12 || 12;
      setClockStr(`${hours}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut (Escape) to close pairing modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPairModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // WebRTC PeerJS Setup with Public STUN Servers & Dual Stream/Data Listeners
  useEffect(() => {
    let peer: Peer | null = null;
    try {
      peer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
          ],
        },
      });

      peer.on('open', (id) => {
        console.log('Infotainment WebRTC Peer ready:', id);
        setVerifiedPeerId(id);
      });

      // Track playable media separately from an allocated but stalled MediaStream.
      peer.on('call', (call) => {
        let received:MediaStream|null=null; call.answer();
        call.on('stream', remoteStream => {
          received=remoteStream;lastVideoAt.current=0;lastVideoTime.current=-1;setVideoReady(false);
          setCameraStream(remoteStream);setIsWebRtcConnected(true);setLeftViewMode('camera');
          remoteStream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{setCameraStream(current=>current===remoteStream?null:current);setVideoReady(false);},{once:true}));
        });
        const clear=()=>{setCameraStream(current=>current===received?null:current);setVideoReady(false);};
        call.on('close',clear);call.on('error',clear);
      });
      peer.on('connection',conn=>{
        conn.on('data',(data:any)=>{packetReceiver.current(data);if(typeof data?.camera_b64==='string'&&conn.open)conn.send({kind:'margai.frame.received',receivedAt:Date.now()});});
        conn.on('close',()=>{if(Date.now()-lastImageAt.current>3000)setIsWebRtcConnected(false);});
      });

      peer.on('error', (err: any) => {
        if(err.type==='unavailable-id'){const id=`margai-${Math.floor(1000 + Math.random()*9000)}`;try{sessionStorage.setItem('margai.display.id',id);}catch{}setVerifiedPeerId('');setPeerId(id);}
        console.warn('Peer note:', err);
      });
    } catch (e) {
      console.warn('WebRTC peer init note:', e);
    }

    return () => {
      if (peer) peer.destroy();
    };
  }, [peerId]);

  // LAN relay fallback: the static hosted viewer uses WebRTC without a REST relay.
  useEffect(() => {
    if (!HAS_ROAD_API) return;
    const relay = new LiveRelay();
    relay.whenOpen(() => relay.send('pair.join', {code:peerId.replace(/^margai-/i,''),role:'car'}));
    relay.on('infotainment.update', event => packetReceiver.current(event.payload));
    return () => relay.close();
  }, [peerId]);

  // Robustly Attach MediaStream to Video Elements whenever Stream or ViewMode changes
  useEffect(() => {
    if (cameraStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = cameraStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (pipVideoRef.current) {
        pipVideoRef.current.srcObject = cameraStream;
        pipVideoRef.current.play().catch(() => {});
      }
    }
  }, [cameraStream, leftViewMode]);

  useEffect(()=>{
    const interval=setInterval(()=>{
      const v=remoteVideoRef.current;const now=Date.now();
      if(v&&v.readyState>=2&&v.videoWidth&&v.currentTime!==lastVideoTime.current){lastVideoTime.current=v.currentTime;lastVideoAt.current=now;setVideoReady(true);}
      if(now-lastVideoAt.current>4000)setVideoReady(false);
      if(now-Math.max(lastVideoAt.current,lastImageAt.current)>5000)setIsWebRtcConnected(false);
      setFeedClock(now);
    },1000);return()=>clearInterval(interval);
  },[]);

  // Direct Hardware Camera Trigger with Automatic Fallback Cascade
  const startDeviceCamera = async () => {
    setShowPairModal(false); // Auto-close pairing modal immediately
    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' } },
            audio: false,
          });
        } catch (e2) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) throw new Error('No camera stream');
      setCameraStream(stream);
      setLeftViewMode('camera');
      showToast('🎥 Device Camera Feed Active on Infotainment!');
    } catch (err: any) {
      console.warn('Camera error:', err);
      showToast('Camera error: ' + (err.message || 'Please allow camera access'));
    }
  };

  // Real-Time ML Detection Loop on live incoming camera feed in Infotainment (Non-blocking 350ms interval)
  useEffect(() => {
    if (!analysisCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 90;
      analysisCanvasRef.current = c;
    }

    const interval = setInterval(async () => {
      const v = remoteVideoRef.current;
      if (Date.now()<phoneInferenceUntil.current || !v || v.readyState < 2 || (!cameraStream && !phoneCameraB64)) return;

      try {
        const res = await detectHazards(v, analysisCanvasRef.current!);
        setIsMlDetecting(res.hazards.length > 0);
        ingestPhoneHazards(res.hazards);
      } catch (e) {}
    }, 350);

    return () => clearInterval(interval);
  }, [cameraStream, phoneCameraB64]);

  // BroadcastChannel: Cross-Tab Camera Frame Stream from Smartphone
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('margai_road_telemetry');
      bc.onmessage = (event) => {
        packetReceiver.current(event.data);
      };
    } catch (e) {}

    return () => {
      if (bc) bc.close();
    };
  }, [isBumpActive]);

  const applyScenario = (mode: 'urgent' | 'vernacular' | 'cleared' | 'pothole' | 'animal' | 'waterlogging') => {
    setActiveScenario(mode as any);
    if (mode === 'urgent' || mode === 'vernacular') {
      setVehicleSpeed(90);
      setHazards([
        {
          id: 'hz_ped_1',
          key: 'walker',
          distance: 75,
          n: 1,
          alerted: true,
          confirmed: true,
          label: 'Pedestrian',
          confidence: 94,
          bbox: [66, 26, 84, 82],
          geo: activeGeo,
          manual: true,
        } as any,
      ]);
      setNoteText({ text: '', until: 0 });
      playChime(3);
      speakPhrase('walker');
    } else if (mode === 'pothole') {
      setVehicleSpeed(65);
      setHazards([
        {
          id: 'hz_pot_1',
          key: 'pothole',
          distance: 45,
          n: 2,
          alerted: true,
          confirmed: true,
          label: 'Pothole D40',
          confidence: 92,
          bbox: [22, 58, 48, 80],
          geo: activeGeo,
          manual: true,
        } as any,
      ]);
      setNoteText({ text: '', until: 0 });
      playChime(2);
      speakPhrase('pothole');
    } else if (mode === 'animal') {
      setVehicleSpeed(55);
      setHazards([
        {
          id: 'hz_ani_1',
          key: 'animal',
          distance: 50,
          n: 1,
          alerted: true,
          confirmed: true,
          label: 'Stray Cattle',
          confidence: 89,
          bbox: [40, 35, 68, 75],
          geo: activeGeo,
          manual: true,
        } as any,
      ]);
      setNoteText({ text: '', until: 0 });
      playChime(3);
      speakPhrase('animal');
    } else if (mode === 'waterlogging') {
      setVehicleSpeed(50);
      setHazards([
        {
          id: 'hz_wat_1',
          key: 'waterlogging',
          distance: 40,
          n: 1,
          alerted: true,
          confirmed: true,
          label: 'Flooded Surface',
          confidence: 91,
          bbox: [12, 65, 52, 88],
          geo: activeGeo,
          manual: true,
        } as any,
      ]);
      setNoteText({ text: '', until: 0 });
      playChime(2);
      speakPhrase('waterlogging');
    } else if (mode === 'cleared') {
      setVehicleSpeed(90);
      setHazards([]);
      setNoteText({
        text: 'NO HAZARDS IN SIGHT · Geofenced Corridor Clear',
        until: Date.now() + 15000,
      });
      playChime(1);
    }
  };

  const ingestPhoneHazards = (detectedHazards: any[]) => {
    if (!detectedHazards || detectedHazards.length === 0) {
      // Clear all incoming camera hazards when road is clear
      setHazards((prev) => prev.filter((h) => (h as any).manual));
      return;
    }

    detectedHazards.forEach((dh) => {
      let key = 'pothole';
      const ht = (dh.hazard_type || '').toUpperCase();
      if (ht.includes('ANIMAL') || ht.includes('COW') || ht.includes('CATTLE') || ht.includes('DOG')) key = 'animal';
      else if (ht.includes('PEDESTRIAN') || ht.includes('WALKER') || ht.includes('PERSON')) key = 'walker';
      else if (ht.includes('WATER') || ht.includes('FLOOD')) key = 'waterlogging';
      else if (ht.includes('CURVE') || ht.includes('TURN')) key = 'curve';
      else if (ht.includes('POTHOLE')) key = 'pothole';
      else return;

      const estDist = dh.distance_m ? Math.round(dh.distance_m) : 60;
      const spec = HAZARD_SPECS[key] || HAZARD_SPECS.pothole;
      const confidence = typeof dh.confidence === 'number' ? dh.confidence : null;
      const conf = confidence === null ? 0 : Math.round(confidence <= 1 ? confidence * 100 : confidence);

      if (dh.geo) {
        setActiveGeo({ lat: dh.geo.lat, lng: dh.geo.lng });
      }

      setHazards((prev) => {
        const exists = prev.find((h) => h.key === key);
        if (exists) {
          return prev.map((h) =>
            h.id === exists.id
              ? {
                  ...h,
                  distance: estDist,
                  n: h.n + 1,
                  bbox: dh.bbox || h.bbox,
                  confidence: conf,
                  label: dh.label || spec.n,
                }
              : h
          );
        }

        if (Date.now() - lastAlertTimeRef.current > 4000) {
          lastAlertTimeRef.current = Date.now();
          showToast(`🚨 ${spec.n.toUpperCase()} IN SIGHT [Geofenced · ${estDist}m]`);
          playChime(spec.lv);
          speakPhrase(key);
        }

        return [
          ...prev,
          {
            id: `hz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            key,
            distance: estDist,
            n: 1,
            alerted: true,
            confirmed: true,
            bbox: dh.bbox,
            confidence: conf,
            label: dh.label || spec.n,
            geo: dh.geo || activeGeo,
          },
        ];
      });
    });
  };

  const triggerBumpEvent = (gVal: number) => {
    setIsBumpActive(true);
    showToast(`💥 Pothole Shockwave Detected: ${gVal.toFixed(2)}G`);
    setNoteText({
      text: `IMU Bump Spike (${gVal.toFixed(2)}G) · Pothole Logged`,
      until: Date.now() + 4000,
    });
    playChime(2);

    setTimeout(() => {
      setIsBumpActive(false);
    }, 1200);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  const playChime = (level: number) => {
    if (muted) return;
    try {
      audioSynthesizer.playRiskChime(level === 3 ? 'urgent' : level === 2 ? 'caution' : 'information');
    } catch (e) {}
  };

  const speakPhrase = (key: string) => {
    if (muted) return;
    const phrase =
      LOCALIZED_CATALOG[currentLang]?.hazardPhrases[key as keyof typeof LOCALIZED_CATALOG.en.hazardPhrases] ||
      LOCALIZED_CATALOG.en.hazardPhrases[key as keyof typeof LOCALIZED_CATALOG.en.hazardPhrases];

    if (phrase && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(phrase);
        u.lang =
          currentLang === 'hi'
            ? 'hi-IN'
            : currentLang === 'ta'
            ? 'ta-IN'
            : currentLang === 'te'
            ? 'te-IN'
            : currentLang === 'kn'
            ? 'kn-IN'
            : 'en-IN';
        u.rate = 1.05;
        setTimeout(() => window.speechSynthesis.speak(u), 150);
      } catch (e) {}
    }
  };

  // Real-Time Distance Physics Loop
  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      const dt = Math.min(0.1, (timestamp - lastLoopTimeRef.current) / 1000);
      lastLoopTimeRef.current = timestamp;

      const speedMps = (vehicleSpeedRef.current * 1000) / 3600;
      mapDistanceRef.current = (mapDistanceRef.current + speedMps * 0.8 * dt) % 5000;

      if (timestamp - lastHazardStateUpdateRef.current >= 150) {
        const stepDt = Math.min(0.3, (timestamp - lastHazardStateUpdateRef.current) / 1000);
        lastHazardStateUpdateRef.current = timestamp;

        setHazards((prevHazards) => {
          const updated = prevHazards.map((h) => {
            // Realistic approach speed: decelerates as vehicle approaches hazard
            const rate = h.distance > 30 ? speedMps * 0.35 : speedMps * 0.1;
            const newDist = Math.max(10, h.distance - rate * stepDt);
            let alerted = h.alerted;

            if (!alerted && newDist <= 120 && !HAZARD_SPECS[h.key]?.quiet) {
              alerted = true;
              playChime(HAZARD_SPECS[h.key]?.lv || 2);
              speakPhrase(h.key);
            }
            return { ...h, distance: newDist, alerted };
          });

          return updated;
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const topHazard = hazards.slice().sort((a, b) => a.distance - b.distance)[0];
  const isPedestrianHazard = topHazard?.key === 'walker';
  const isClearedState = !topHazard && (noteText.until > Date.now() || activeScenario === 'cleared');

  // Road Perspective Math
  const W = 800;
  const Y0 = 140;
  const YB = 440;
  const geo = (d: number) => {
    const dC = Math.max(0, Math.min(d, 300));
    const u = 1 - dC / 300;
    const y = Y0 + (YB - Y0) * Math.pow(u, 1.85);
    const k = 0.12 + 0.88 * Math.pow(u, 1.85);
    return { y, k, u };
  };

  const X_proj = (lane: number, y: number) => {
    const u = (y - Y0) / (YB - Y0);
    const vpX = W * 0.5;
    const wBase = 460;
    const laneOffsetPx = lane * (wBase * 0.38) * u;
    return vpX + laneOffsetPx;
  };

  const dashFlowDuration = `${Math.max(0.4, 28 / Math.max(15, vehicleSpeed))}s`;

  const activePairId = verifiedPeerId || peerId;
  const phonePairUrl = (() => {
    try {
      const url = new URL(hostedPhone ? hostedPhoneOrigin : phoneOrigin || window.location.origin + window.location.pathname);
      if (hostedPhone && url.protocol !== 'https:') return '';
      url.search = ''; url.searchParams.set('view','smartphone'); url.searchParams.set('pair',activePairId); return url.href;
    } catch { return ''; }
  })();

  useEffect(() => { if (!phonePairUrl) { setPairQr(''); return; } void QRCode.toDataURL(phonePairUrl, {width:180,margin:1}).then(setPairQr).catch(() => setPairQr('')); }, [phonePairUrl]);

  const copyPairLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phonePairUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  packetReceiver.current=(data:any)=>{
    if(!data||typeof data!=='object')return;
    if(typeof data.camera_b64==='string'&&data.camera_b64.startsWith('data:image/')){
      lastImageAt.current=Date.now();setPhoneCameraB64(data.camera_b64);setIsWebRtcConnected(true);setLeftViewMode('camera');setShowPairModal(false);
    }
    if(data.model_status)phoneInferenceUntil.current=Date.now()+4000;
    if(data.telemetry){setPhoneSensors(readPhoneTelemetry(data.telemetry));setSensorReceivedAt(Date.now());}
    if(Array.isArray(data.hazards))ingestPhoneHazards(data.hazards);
    if(typeof data.speed_kmh==='number'&&data.speed_kmh>=0)setVehicleSpeed(Math.round(data.speed_kmh));
    if(Object.prototype.hasOwnProperty.call(data,'gps')){
      const gps=data.gps&&typeof data.gps.latitude==='number'&&typeof data.gps.longitude==='number'?data.gps:null;
      setPhoneTelemetry({gps,speedKmh:typeof data.speed_kmh==='number'?data.speed_kmh:null,heading:typeof data.heading==='number'?data.heading:null,gForce:typeof data.g_force==='number'?data.g_force:null});
      if(gps)setActiveGeo({lat:gps.latitude,lng:gps.longitude});
      if(typeof data.g_force==='number')setZAccelG(data.g_force);
    }
  };
  const hasFreshImage=!!phoneCameraB64&&feedClock-lastImageAt.current<5000;
  const hasLiveCamera=videoReady||hasFreshImage;


  return (
    <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-3 py-3 border rounded bg-white text-slate-700 text-xs" role="status">
        <span>Website display ID: <strong className="font-mono">{activePairId}</strong></span>
        <span>{hasLiveCamera?'Receiving live phone view':'Waiting for phone camera — enter this ID in the phone’s Car display field and tap Connect.'}</span>
        <button onClick={()=>setShowPairModal(true)} className="px-3 py-2 border rounded">Pair phone / QR</button>
      </div>
      {/* SCENARIO & CAMERA SOURCE CONTROLS BAR */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 bg-[#0d1322] border border-[#1e293b] p-2.5 px-3.5 rounded-2xl text-xs font-mono">
        {/* Left View Mode Toggle: Camera Feed vs 3D Road */}
        <div className="flex items-center gap-1.5 bg-[#080c14] border border-[#1e293b] rounded-xl p-1">
          <button
            onClick={() => setLeftViewMode('camera')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              leftViewMode === 'camera'
                ? 'bg-[#38bdf8] text-slate-900 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live camera</span>
          </button>

          <button
            onClick={() => setLeftViewMode('road')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              leftViewMode === 'road'
                ? 'bg-[#38bdf8] text-slate-900 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Road view</span>
          </button>
        </div>

        {/* Hazard Testing Simulator Bar */}
        <div className="flex items-center gap-1 bg-[#080c14] border border-[#1e293b] rounded-xl p-1 text-[11px]">
          <span className="text-slate-400 font-bold px-1.5 hidden lg:inline">Demo scenarios:</span>
          <button
            onClick={() => applyScenario('urgent')}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${
              hazards.some((h) => h.key === 'walker') ? 'bg-red-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
            title="Test Pedestrian in sight"
          >
            🚶 Pedestrian
          </button>
          <button
            onClick={() => applyScenario('pothole')}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${
              hazards.some((h) => h.key === 'pothole') ? 'bg-amber-600 text-black shadow' : 'text-slate-300 hover:text-white'
            }`}
            title="Test Pothole in sight"
          >
            🕳️ Pothole
          </button>
          <button
            onClick={() => applyScenario('animal')}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${
              hazards.some((h) => h.key === 'animal') ? 'bg-red-500 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
            title="Test Cattle in sight"
          >
            🐄 Cattle
          </button>
          <button
            onClick={() => applyScenario('waterlogging')}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${
              hazards.some((h) => h.key === 'waterlogging') ? 'bg-cyan-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
            title="Test Waterlogging in sight"
          >
            🌊 Water
          </button>
          <button
            onClick={() => applyScenario('cleared')}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${
              hazards.length === 0 ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'
            }`}
            title="Clear all hazards"
          >
            🟢 All Clear
          </button>
        </div>

        {/* Live Camera Feed Actions */}
        <div className="flex items-center gap-2">
          {/* Direct Camera Button */}
          <button
            onClick={startDeviceCamera}
            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
              cameraStream
                ? 'bg-[#22c55e] text-black border-[#22c55e]'
                : 'bg-[#1e293b] text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
            title="Use current device camera directly"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{videoReady ? 'Camera active' : 'Enable Device Camera'}</span>
          </button>

          {/* QR Pairing for Phone Camera Stream */}
          <button
            onClick={() => setShowPairModal(true)}
            className="px-3 py-1.5 rounded-xl bg-[#4285F4] hover:bg-blue-600 text-white font-bold flex items-center gap-1.5 transition-all shadow-md"
            title="Pair with phone camera over WebRTC"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Pair Smartphone</span>
            {isWebRtcConnected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>}
          </button>

          {/* Bump Spike Button */}
          <button
            onClick={() => triggerBumpEvent(2.4)}
            className="px-2.5 py-1.5 rounded-xl bg-[#FBBC05]/20 text-[#FBBC05] hover:bg-[#FBBC05]/30 border border-[#FBBC05]/30 font-bold flex items-center gap-1 transition-all active:scale-95"
          >
            💥 Shockwave (2.4G)
          </button>
        </div>
      </div>

      <RoadPhoneSensors readings={phoneSensors} receivedAt={sensorReceivedAt} now={feedClock}/>
      {/* AUTOMOTIVE TOUCHSCREEN BEZEL (16:9 DISPLAY) */}
      <div className="relative w-full aspect-[16/9] min-h-[440px] max-h-[640px] bg-[#0c0f17] border-[12px] sm:border-[16px] border-[#181c26] rounded-[28px] sm:rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col select-none ring-1 ring-white/10">
        
        {/* TOP STATUS BAR */}
        <div className="w-full h-8 px-4 sm:px-6 bg-[#0a0d14] border-b border-white/[0.06] flex items-center justify-between text-slate-400 text-xs font-mono z-30">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300 text-[11px]">MargAI / Drive showcase</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              {isWebRtcConnected
                ? (hasLiveCamera?'Phone camera · live':'Phone connected · waiting for video')
                : cameraStream
                ? 'Local Dashcam Feed Active'
                : phoneCameraB64
                ? 'Smartphone Dashcam Feed Active'
                : 'MargAI Road Intelligence Active'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Wifi className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-slate-300 font-bold">{hasLiveCamera?'Live feed':'Waiting'}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <Battery className="w-3.5 h-3.5 text-slate-300" />
              <span>Phone sensors</span>
            </div>
            <div className="font-bold text-white tracking-wide text-xs">
              {clockStr}
            </div>
          </div>
        </div>

        {/* MAIN SPLIT SCREEN: LEFT 50% CAMERA OR 3D ROAD | RIGHT 50% NAVIGATION MAP */}
        <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 relative overflow-hidden">
          
          {/* ============================================================== */}
          {/* LEFT HALF: LIVE CAMERA FEED (SLIDE 10.3) OR 3D ROAD (SLIDE 10.2) */}
          {/* ============================================================== */}
          <div className="relative h-full w-full bg-[#11141c] border-r border-white/[0.08] overflow-hidden flex flex-col justify-between">
            
            {/* Speed & Drive Gear Cluster */}
            <div className="absolute top-4 left-6 z-30 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#2563eb] text-white font-extrabold text-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                D
              </div>
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none font-mono drop-shadow-md">
                  {phoneTelemetry?.speedKmh==null?'—':Math.round(phoneTelemetry.speedKmh)}
                </div>
                <div className="text-[11px] font-mono text-slate-300 uppercase tracking-widest mt-0.5 drop-shadow">
                  km/h
                </div>
              </div>
            </div>

            {/* VIEWPORT: CAMERA FEED (SLIDE 10.3) */}
            {leftViewMode === 'camera' ? (
              <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
                {/* 1. Direct WebRTC Stream or Local Camera Video Element (Always Mounted) */}
                <video
                  ref={(el) => {
                    remoteVideoRef.current = el;
                    if (el && cameraStream && el.srcObject !== cameraStream) {
                      el.srcObject = cameraStream;
                      el.play().catch(() => {});
                    }
                  }}
                  playsInline
                  muted
                  autoPlay
                  onLoadedMetadata={(e) => {
                    (e.target as HTMLVideoElement).play().catch(() => {});
                  }}
                  onLoadedData={()=>{lastVideoAt.current=Date.now();setVideoReady(true);setShowPairModal(false);}}
                  onError={()=>setVideoReady(false)}
                  className={`absolute inset-0 w-full h-full object-contain ${cameraStream ? 'block' : 'hidden'}`}
                />

                {/* 2. Base64 Frame Stream from Smartphone (DataConnection or BroadcastChannel fallback) */}
                {hasFreshImage && (
                  <img
                    src={phoneCameraB64}
                    alt="Live phone camera frame"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}

                {/* 3. Standby Overlay with 1-Click Buttons when no live feed connected */}
                {!hasLiveCamera && (
                  <div className="relative w-full h-full">
                    <video
                      src="./road_sample.mp4"
                      playsInline
                      muted
                      autoPlay
                      loop
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center z-20">
                      <div className="bg-[#0f1422]/95 border border-white/20 p-5 rounded-2xl max-w-sm shadow-2xl flex flex-col items-center gap-3">
                        <Camera className="w-10 h-10 text-[#38bdf8] animate-bounce" />
                        <h4 className="font-extrabold text-white text-base">Show Phone Camera Feed</h4>
                        <p className="text-xs text-slate-300 font-sans">
                          Turn on your device's camera or scan the QR code with your smartphone to stream live road vision.
                        </p>
                        <div className="flex flex-col w-full gap-2 pt-1 font-mono text-xs">
                          <button
                            onClick={startDeviceCamera}
                            className="w-full py-2.5 bg-[#22c55e] hover:bg-emerald-600 text-black font-extrabold rounded-xl shadow-lg transition-all"
                          >
                            Enable this device’s camera
                          </button>
                          <button
                            onClick={() => setShowPairModal(true)}
                            className="w-full py-2.5 bg-[#4285F4] hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>Pair Another Phone via QR</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAMERA OVERLAYS — Only show when matching hazards are active and in sight */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  {/* Dynamic Bounding Boxes for every hazard in sight */}
                  {hazards.map((h, i) => {
                    const isPothole = h.key === 'pothole';
                    const isWalker = h.key === 'walker';
                    const isAnimal = h.key === 'animal';
                    const isWater = h.key === 'waterlogging';
                    const color = isWalker ? '#ef4444' : isAnimal ? '#dc2626' : isWater ? '#06b6d4' : '#f59e0b';
                    const textColor = isWalker || isAnimal ? 'text-white' : 'text-black';

                    // Use detected bbox percentage if available, otherwise realistic position
                    const left = h.bbox ? h.bbox[0] : isPothole ? 22 : isWalker ? 68 : isWater ? 15 : 45;
                    const top = h.bbox ? h.bbox[1] : isPothole ? 60 : isWalker ? 28 : isWater ? 68 : 38;
                    const width = h.bbox ? Math.max(8, h.bbox[2] - h.bbox[0]) : isPothole ? 26 : isWalker ? 18 : isWater ? 35 : 24;
                    const height = h.bbox ? Math.max(8, h.bbox[3] - h.bbox[1]) : isPothole ? 22 : isWalker ? 54 : isWater ? 20 : 38;

                    return (
                      <div
                        key={h.id || i}
                        className="absolute border-2 pointer-events-none transition-all duration-150 animate-pulse"
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                          borderColor: color,
                          backgroundColor: `${color}20`,
                          boxShadow: `0 0 16px ${color}80`,
                        }}
                      >
                        <span
                          className={`absolute -top-5 left-0 font-extrabold text-[10px] px-1.5 py-0.5 rounded-sm uppercase tracking-wide font-mono shadow ${textColor}`}
                          style={{ backgroundColor: color }}
                        >
                          {h.label || (isWalker ? 'PEDESTRIAN' : isPothole ? 'POTHOLE' : isAnimal ? 'ANIMAL' : 'WATERLOGGING')} {h.confidence || 92}%
                        </span>

                        {/* Geofence Tag on bounding box */}
                        <span className="absolute -bottom-4 left-0 bg-black/85 text-emerald-300 font-mono text-[9px] px-1.5 py-0.2 rounded border border-emerald-500/30 flex items-center gap-1 shadow whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span>GEOFENCE: {activeGeo.lat.toFixed(4)}°N, {activeGeo.lng.toFixed(4)}°E</span>
                        </span>
                      </div>
                    );
                  })}

                  {/* Roadside Filter Indicator — only when any hazard is active */}
                  {hazards.length > 0 && (
                    <div className="absolute left-[12%] bottom-[20%] flex items-center gap-1.5 bg-black/80 border border-slate-600 px-3 py-1 rounded-full text-[10px] font-mono text-slate-200 backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>FILTERED: ROADSIDE</span>
                    </div>
                  )}

                  {/* Feed Status Tag */}
                  <div className="absolute top-4 right-4 bg-black/70 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-400 backdrop-blur-md flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>
                      {isWebRtcConnected
                        ? (hasLiveCamera?'Phone camera · live':'Waiting for phone frames')
                        : cameraStream
                        ? 'Device Cam (Live)'
                        : phoneCameraB64
                        ? 'Smartphone Sync'
                        : 'Camera Ready'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* VIEWPORT: 3D VECTOR PERSPECTIVE ROAD (SLIDE 10.2) */
              <div className="relative w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 800 480" className="absolute inset-0 w-full h-full">
                  <defs>
                    <linearGradient id="roadAsphalt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#171b24" />
                      <stop offset="60%" stopColor="#1e2330" />
                      <stop offset="100%" stopColor="#252b3b" />
                    </linearGradient>

                    <linearGradient id="brakeConeGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55" />
                      <stop offset="40%" stopColor="#dc2626" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                    </linearGradient>

                    <linearGradient id="horizonFade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#11141c" stopOpacity="1" />
                      <stop offset="100%" stopColor="#11141c" stopOpacity="0" />
                    </linearGradient>

                    <filter id="pedGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#ef4444" floodOpacity="0.8" />
                    </filter>
                  </defs>

                  <polygon
                    points={`${X_proj(-1.6, Y0)},${Y0} ${X_proj(1.6, Y0)},${Y0} ${X_proj(2.0, YB)},${YB} ${X_proj(-2.0, YB)},${YB}`}
                    fill="url(#roadAsphalt)"
                  />
                  <line x1={X_proj(-1.4, Y0)} y1={Y0} x2={X_proj(-1.8, YB)} y2={YB} stroke="#475569" strokeWidth="2.5" strokeOpacity="0.6" />
                  <line x1={X_proj(1.4, Y0)} y1={Y0} x2={X_proj(1.8, YB)} y2={YB} stroke="#475569" strokeWidth="2.5" strokeOpacity="0.6" />

                  <line
                    x1={X_proj(0, Y0)}
                    y1={Y0}
                    x2={X_proj(0, YB)}
                    y2={YB}
                    stroke="#ffffff"
                    strokeWidth="4"
                    strokeOpacity="0.75"
                    strokeDasharray="28 22"
                    style={{ animation: `flow ${dashFlowDuration} linear infinite` }}
                  />

                  {/* Red Collision Cone */}
                  {topHazard && !isClearedState && (
                    <g>
                      <polygon
                        points={`375,410 425,410 ${X_proj(0.9, geo(topHazard.distance).y)},${geo(topHazard.distance).y} ${X_proj(-0.9, geo(topHazard.distance).y)},${geo(topHazard.distance).y}`}
                        fill="url(#brakeConeGrad)"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeOpacity="0.8"
                      />
                      <path
                        d={`M ${X_proj(-0.7, geo(topHazard.distance * 0.7).y)} ${geo(topHazard.distance * 0.7).y} Q ${X_proj(0, geo(topHazard.distance * 0.7).y)} ${geo(topHazard.distance * 0.7).y - 8} ${X_proj(0.7, geo(topHazard.distance * 0.7).y)} ${geo(topHazard.distance * 0.7).y}`}
                        stroke="#ef4444"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                        fill="none"
                        opacity="0.9"
                      />
                    </g>
                  )}

                  {/* Red Pedestrian Avatar */}
                  {topHazard && isPedestrianHazard && !isClearedState && (
                    <g
                      transform={`translate(${X_proj(0.08, geo(topHazard.distance).y)}, ${geo(topHazard.distance).y}) scale(${geo(topHazard.distance).k * 1.35})`}
                      filter="url(#pedGlow)"
                    >
                      <ellipse rx="38" ry="12" fill="#ef4444" fillOpacity="0.3" stroke="#ef4444" strokeWidth="2.5" />
                      <circle cx="0" cy="-64" r="8" fill="#ef4444" />
                      <rect x="-6" y="-54" width="12" height="24" rx="4" fill="#ef4444" />
                      <line x1="-3" y1="-30" x2="-10" y2="-6" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                      <line x1="3" y1="-30" x2="10" y2="-6" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                      <line x1="-6" y1="-48" x2="-14" y2="-28" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                      <line x1="6" y1="-48" x2="14" y2="-32" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                      <polygon points="0,-82 -10,-68 10,-68" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                      <text x="0" y="-71" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ffffff">
                        !
                      </text>
                    </g>
                  )}

                  <rect x="0" y="0" width="800" height={Y0 + 20} fill="url(#horizonFade)" />

                  {/* Silver Car Avatar */}
                  <g transform="translate(400, 420)">
                    <ellipse cx="0" cy="18" rx="88" ry="12" fill="#000000" opacity="0.6" />
                    <path d="M-72 8 L-64 22 L64 22 L72 8 Z" fill="#1e2430" stroke="#334155" strokeWidth="1.5" />
                    <path d="M-76 6 Q-78 -24 -60 -36 L60 -36 Q78 -24 76 6 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1.5" />
                    <path d="M-52 -36 L-38 -72 Q-32 -76 0 -76 Q32 -76 38 -72 L52 -36 Z" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
                    <rect x="-68" y="-12" width="136" height="7" rx="3.5" fill="#ef4444" />
                    <rect x="-70" y="-14" width="22" height="11" rx="3" fill="#dc2626" />
                    <rect x="48" y="-14" width="22" height="11" rx="3" fill="#dc2626" />
                    <ellipse cx="-59" cy="-8" rx="14" ry="4" fill="#ef4444" opacity="0.4" />
                    <ellipse cx="59" cy="-8" rx="14" ry="4" fill="#ef4444" opacity="0.4" />
                    <rect x="-24" y="-2" width="48" height="14" rx="2" fill="#0f172a" stroke="#cbd5e1" strokeWidth="1" />
                    <text x="0" y="8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#38bdf8">
                      MARG•AI
                    </text>
                  </g>
                </svg>
              </div>
            )}

            {/* BOTTOM HUD BANNER */}
            <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
              {topHazard && !isClearedState ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2b0c10]/95 border border-[#ef4444] text-[#ef4444] shadow-2xl backdrop-blur-md animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
                  <span className="font-extrabold text-xs sm:text-sm tracking-wider uppercase">
                    ▲ URGENT PEDESTRIAN RISK [{Math.max(10, Math.round(topHazard.distance))}m]
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-5 py-2 rounded-xl bg-[#092314]/95 border border-[#22c55e] text-center shadow-2xl backdrop-blur-md">
                  <div className="font-extrabold text-sm sm:text-base text-[#22c55e] tracking-wider uppercase">
                    NO CURRENT DETECTIONS
                  </div>
                  <div className="text-[11px] font-mono text-emerald-300">
                    No detections in the current frame
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================== */}
          {/* RIGHT HALF: NAVIGATION MAP + TOP ALERT CARD */}
          {/* ============================================================== */}
          <div className="relative h-full w-full bg-[#0d1017] overflow-hidden flex flex-col justify-between">
            
            {/* TOP ALERT BANNER (Slide 10.2 & 10.3) */}
            <div className="p-3 sm:p-4 z-20">
              {topHazard && !isClearedState ? (
                <div
                  className={`w-full rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 border transition-all ${
                    topHazard.key === 'pothole'
                      ? 'bg-[#2d1a08]/95 border-[#f59e0b]'
                      : topHazard.key === 'waterlogging'
                      ? 'bg-[#09232d]/95 border-[#06b6d4]'
                      : topHazard.key === 'animal'
                      ? 'bg-[#33140c]/95 border-[#ea580c]'
                      : 'bg-[#300d12]/95 border-[#ef4444]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center font-extrabold text-lg flex-shrink-0 ${
                        topHazard.key === 'pothole'
                          ? 'bg-[#f59e0b]/20 border-[#f59e0b] text-[#f59e0b]'
                          : topHazard.key === 'waterlogging'
                          ? 'bg-[#06b6d4]/20 border-[#06b6d4] text-[#06b6d4]'
                          : topHazard.key === 'animal'
                          ? 'bg-[#ea580c]/20 border-[#ea580c] text-[#ea580c]'
                          : 'bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]'
                      }`}
                    >
                      {topHazard.key === 'pothole' ? '🕳️' : topHazard.key === 'waterlogging' ? '🌊' : topHazard.key === 'animal' ? '🐄' : '▲'}
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-extrabold text-white leading-tight">
                        {topHazard.key === 'walker'
                          ? 'URGENT: Person Crossing Ahead. Brake gently'
                          : topHazard.key === 'animal'
                          ? 'URGENT: Stray Cattle / Animal Crossing Ahead. Slow down'
                          : topHazard.key === 'waterlogging'
                          ? 'CAUTION: Flooded Road Surface Ahead. Reduce speed'
                          : 'CAUTION: Pothole Detected in Lane. Slow down'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-200/90 font-medium tracking-wide">
                          {LOCALIZED_CATALOG[currentLang]?.hazardPhrases[topHazard.key as keyof typeof LOCALIZED_CATALOG.en.hazardPhrases] ||
                            LOCALIZED_CATALOG.en.hazardPhrases[topHazard.key as keyof typeof LOCALIZED_CATALOG.en.hazardPhrases] ||
                            'முன்னே கவனம் தேவை.'}
                        </span>
                        <span className="text-[9px] font-mono text-emerald-300 bg-black/60 px-1.5 py-0.2 rounded border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          <span>GEOFENCE: {activeGeo.lat.toFixed(4)}°N, {activeGeo.lng.toFixed(4)}°E</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-white bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                      {Math.max(10, Math.round(topHazard.distance))}m
                    </span>

                    <div className="flex items-center gap-0.5 h-6 px-1">
                      {[14, 22, 10, 24, 18, 12, 20].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 rounded-full animate-pulse"
                          style={{
                            height: `${h}px`,
                            backgroundColor:
                              topHazard.key === 'pothole'
                                ? '#f59e0b'
                                : topHazard.key === 'waterlogging'
                                ? '#06b6d4'
                                : topHazard.key === 'animal'
                                ? '#ea580c'
                                : '#ef4444',
                            animationDelay: `${i * 0.12}s`,
                            animationDuration: '0.6s',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-[#091a14]/90 border border-[#22c55e]/60 rounded-2xl p-2.5 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                    <span className="text-xs text-white font-medium">
                      No observations in this view
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">0 Hazards Ahead</span>
                </div>
              )}
            </div>

            {/* Turn-by-Turn Card */}
            <div className="px-4 z-10 flex items-center justify-between">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#141924]/90 border border-white/10 text-white text-xs font-semibold backdrop-blur-md">
                <span className="text-lg text-[#38bdf8] font-bold">↱</span>
                <span>{phoneTelemetry?.gps?`${phoneTelemetry.gps.latitude.toFixed(5)}, ${phoneTelemetry.gps.longitude.toFixed(5)}`:'Waiting for phone GPS'}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>{phoneTelemetry?.gps?`GPS ±${Math.round(phoneTelemetry.gps.accuracy)} m`:'GPS not received'}</span>
              </div>
            </div>

            {/* Actual phone coordinates drive the Google map; no illustrative route is substituted. */}
            <div className="relative flex-1 w-full overflow-auto road-live-map">
              <PhoneLocationMap fix={phoneSensors?.gps??phoneTelemetry?.gps??null} heading={phoneSensors?.gps?.heading??phoneSensors?.heading??phoneTelemetry?.heading??null} stale={sensorReceivedAt?feedClock-sensorReceivedAt>5000||feedClock-(phoneSensors?.gps?.timestamp??0)>15000:!phoneTelemetry?.gps||feedClock-phoneTelemetry.gps.timestamp>15000}/>

              {/* Picture-in-Picture Phone Camera Feed in Corner */}
              {leftViewMode === 'road' && (
                <div className="absolute right-3 bottom-3 w-40 sm:w-48 aspect-video rounded-xl overflow-hidden border border-white/20 shadow-2xl z-20 bg-black">
                  {videoReady && cameraStream ? (
                    <video
                      ref={pipVideoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                  ) : hasFreshImage ? (
                    <img
                      src={phoneCameraB64}
                      alt="Phone Cam"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src="./road_sample.mp4"
                      playsInline
                      muted
                      autoPlay
                      loop
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute top-1 left-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-400">
                    📱 Phone Cam PiP
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM AUTOMOTIVE DOCK */}
        <div className="w-full h-12 sm:h-14 bg-[#0a0d14] border-t border-white/[0.08] px-3 sm:px-6 flex items-center justify-between z-30">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLeftViewMode(leftViewMode === 'camera' ? 'road' : 'camera')}
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#38bdf8] transition-all"
              title="Toggle Camera / 3D Road"
            >
              <Car className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>

            <button
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300 hover:text-white transition-all"
              title="App Launcher"
            >
              <Grid className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <button className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#22c55e]">
              <Phone className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
            <button className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#38bdf8]">
              <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
            <button className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#22c55e]">
              <Music className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
            <button className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#4285F4]">
              <Navigation className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
            <button onClick={() => speakPhrase('walker')} className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#FBBC05]">
              <Mic className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setMuted(!muted)} className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-slate-300">
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              onClick={() => setShowPairModal(true)}
              className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300 transition-all"
              title="Pair Phone via QR"
            >
              <QrCode className="w-4 h-4 text-slate-300" />
            </button>

            <div className="text-white font-mono text-xs font-bold pl-1 hidden sm:block">
              {clockStr}
            </div>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 bg-[#161d2d]/95 border border-[#38bdf8]/40 px-4 py-2 rounded-full text-xs font-mono text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
            {toastMessage}
          </div>
        )}

        {/* QR CODE & WEBRTC PAIRING MODAL */}
        {showPairModal && createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPairModal(false);
            }}
            className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-md flex items-start sm:items-center justify-center overflow-y-auto p-4 cursor-pointer"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-labelledby="phone-pair-title"
              style={{maxHeight:'calc(100dvh - 32px)',overflowY:'auto'}}
              className="bg-[#0f1422] border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center relative shadow-2xl font-mono cursor-default"
            >
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold border border-slate-600 shadow-md transition-all active:scale-95"
                aria-label="Close"
              >
                ✕
              </button>

              <Smartphone className="w-10 h-10 text-[#38bdf8] mx-auto mb-2" />
              <h3 id="phone-pair-title" className="text-lg font-bold text-white">Stream Phone Camera</h3>
              <p className="text-xs text-slate-300 mt-1 mb-3 font-sans">
                Scan with your phone to stream live road vision into this Infotainment display.
              </p>

              <div className="flex gap-2 mb-3" role="group" aria-label="Phone connection method">
                <button className={`flex-1 border px-2 py-2 text-xs rounded ${!hostedPhone ? 'bg-slate-600 text-white' : 'text-slate-300'}`} onClick={() => setHostedPhone(false)} aria-pressed={!hostedPhone}>Local Wi-Fi</button>
                <button className={`flex-1 border px-2 py-2 text-xs rounded ${hostedPhone ? 'bg-slate-600 text-white' : 'text-slate-300'}`} onClick={() => setHostedPhone(true)} aria-pressed={hostedPhone}>Hosted phone page</button>
              </div>
              <p className="text-xs text-slate-300 mb-3">{hostedPhone ? 'Uses the deployed phone website and WebRTC. Your local API is not exposed.' : 'Phone and laptop must be reachable on the same Wi-Fi. Local HTTPS needs the demo certificate.'}</p>
              <a className="block text-xs text-cyan-300 break-all mb-3" href={phonePairUrl} target="_blank" rel="noreferrer">{phonePairUrl}</a>
              {hostedPhone && <label className="block text-xs text-left text-slate-300 mb-3">Updated phone website URL<input type="url" value={hostedPhoneOrigin} onChange={event=>setHostedPhoneOrigin(event.target.value)} placeholder="https://your-site/MargAI/" className="block w-full mt-2 p-2 rounded bg-slate-800 text-white"/></label>}
              {hostedPhone && !phonePairUrl && <p className="text-xs text-amber-200 mb-3">Enter the HTTPS address of the deployed, updated phone app.</p>}
              {/* QR Code */}
              <div className="bg-white p-2.5 rounded-xl inline-block shadow-inner mb-3">
                {pairQr && <img
                  src={pairQr}
                  alt="QR Code"
                  className="w-40 h-40"
                />}
              </div>

              {/* Room Code Badge */}
              <div className="mb-3 px-3 py-1.5 bg-[#172033] rounded-lg border border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-400">Pair Room ID:</span>
                <span className="text-[#38bdf8] font-bold">{activePairId}</span>
              </div>

              {/* Copy URL Button */}
              <button
                type="button"
                onClick={copyPairLink}
                disabled={!phonePairUrl}
                className="w-full py-2 bg-[#1e293b] hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all mb-2 shadow"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Pair Link Copied!' : 'Copy Direct Smartphone Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  startDeviceCamera();
                  setShowPairModal(false);
                }}
                className="w-full py-2 bg-[#22c55e]/20 hover:bg-[#22c55e]/30 text-[#22c55e] border border-[#22c55e]/40 rounded-xl text-xs font-bold transition-all mb-2"
              >
                🎥 Or Use Current Device Camera
              </button>

              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              >
                ✕ Close Window
              </button>
            </div>
          </div>, document.body
        )}
      </div>
    </div>
  );
};
