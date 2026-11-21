import React, { useEffect, useState } from 'react';
import { Cloud, Cpu, Database, ExternalLink, MapPin, Mic2, RefreshCw, Smartphone } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { useI18n } from '../i18n';

interface RuntimeHealth {
  status?: string;
  wsClientsConnected?: number;
  activeHazards?: number;
  googleCloud?: { runRegion?: string };
}
interface RuntimeConfig {
  googleMapsApiKeyConfigured?: boolean;
  geminiConfigured?: boolean;
  firestoreConnected?: boolean;
}
interface LatencyStage { count: number; p95Ms: number }
type RuntimeMetrics = Partial<Record<'capture_to_detection' | 'detection_to_alert' | 'server_relay', LatencyStage>>;
interface ModelReport {
  model?: string;
  training?: { metrics?: { mAP50?: number } };
  benchmark?: { device?: string; iterations?: number; latencyMetricsMs?: { p50_median?: number; p95?: number } };
  export?: { onnx?: string; torchscript?: string; onnx_int8?: string };
}

export const GoogleStackInspector: React.FC = () => {
  const { t } = useI18n();
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [metrics, setMetrics] = useState<RuntimeMetrics | null>(null);
  const [model, setModel] = useState<ModelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUnavailableSources, setHasUnavailableSources] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      apiClient.getHealth(), apiClient.getConfig(), apiClient.getMetrics(), apiClient.getMLMetrics(),
    ]).then(([healthResult, configResult, metricsResult, modelResult]) => {
      if (cancelled) return;
      let unavailable = false;
      if (healthResult.status === 'fulfilled' && healthResult.value?.status === 'ok') setHealth(healthResult.value);
      else { setHealth(null); unavailable = true; }
      if (configResult.status === 'fulfilled' && typeof configResult.value?.geminiConfigured === 'boolean') setConfig(configResult.value);
      else { setConfig(null); unavailable = true; }
      if (metricsResult.status === 'fulfilled' && metricsResult.value && !metricsResult.value.error) setMetrics(metricsResult.value);
      else { setMetrics(null); unavailable = true; }
      if (modelResult.status === 'fulfilled' && modelResult.value?.model) setModel(modelResult.value);
      else { setModel(null); unavailable = true; }
      setHasUnavailableSources(unavailable);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const numberLabel = (value: unknown, suffix = '') => typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}` : t('Not reported');
  const cloudReported = Boolean(health?.googleCloud?.runRegion && !/local|emulat/i.test(health.googleCloud.runRegion));
  const stack = [
    { title: 'Gemini', category: t('Helpful assistance'), icon: Mic2,
      status: loading ? t('Checking') : config ? (config.geminiConfigured ? t('Key configured') : t('Local fallback')) : t('Not verified'),
      description: t('Turns road evidence into a readable report draft.'), url: 'https://ai.google.dev/' },
    { title: 'Cloud Run', category: t('Connected services'), icon: Cloud,
      status: loading ? t('Checking') : health ? (cloudReported ? t('Cloud reported') : t('Local runtime')) : t('Not verified'),
      description: t('A home for the road-event API and vehicle relay.'), url: 'https://cloud.google.com/run' },
    { title: 'Firestore', category: t('Shared road knowledge'), icon: Database,
      status: loading ? t('Checking') : config ? (config.firestoreConnected ? t('Backend reports live') : t('Local store')) : t('Not verified'),
      description: t('Keeps observations and civic case history together.'), url: 'https://firebase.google.com/products/firestore' },
    { title: 'Google Maps Platform', category: t('Road context'), icon: MapPin,
      status: loading ? t('Checking') : config ? (config.googleMapsApiKeyConfigured ? t('Key configured') : t('Demo corridor')) : t('Not verified'),
      description: t('Adds route context to the warnings that matter.'), url: 'https://developers.google.com/maps' },
    { title: 'LiteRT', category: t('Mobile perception'), icon: Cpu, status: t('Validation pending'),
      description: t('The planned runtime for on-device vision.'), url: 'https://developers.google.com/edge/litert' },
    { title: 'Android Auto', category: t('In-car experience'), icon: Smartphone, status: t('Planned integration'),
      description: t('A supported path to the car display.'), url: 'https://developer.android.com/training/cars/apps/navigation' },
  ];
  const stages = [
    { key: 'capture_to_detection' as const, label: t('Capture to detection') },
    { key: 'detection_to_alert' as const, label: t('Detection to alert') },
    { key: 'server_relay' as const, label: t('Server relay') },
  ];
  const resources = [
    { name: 'Startup Buildathon India 2026', url: 'https://startupbuildathon.com/' },
    { name: 'Google Cloud for Startups', url: 'https://cloud.google.com/startup' },
    { name: 'Google DeepMind', url: 'https://deepmind.google/' },
    { name: 'Headstart', url: 'https://www.headstart.in/' },
    { name: 'Hack2skill', url: 'https://hack2skill.com/' },
    { name: 'nasscom', url: 'https://nasscom.in/' },
  ];
  const formats = model?.export ? [model.export.onnx && 'ONNX', model.export.torchscript && 'TorchScript', model.export.onnx_int8 && 'INT8 ONNX'].filter(Boolean) : [];

  return (
    <div className="premium-page space-y-8 pb-12 text-[#17263e]">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow mb-3 text-[#2563eb]">{t('Behind MargAI')}</p><h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.045em] text-[#17263e]">{t('Good technology. Clear purpose.')}</h1><p className="mt-4 max-w-xl text-base leading-7 text-[#67788f]">{t('Six building blocks for a more aware journey.')}</p></div>
        <button type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading} className="premium-button-secondary self-start disabled:opacity-50" aria-label={t('Refresh technology status')}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />{loading ? t('Checking') : t('Refresh')}</button>
      </header>
      <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5" aria-label={t('Technology overview')} aria-busy={loading}>
        {stack.map(({ icon: Icon, ...item }) => <article key={item.title} className="rounded-3xl border border-[#dce5f2] bg-white p-6 sm:p-7 shadow-[0_12px_35px_-20px_rgba(47,76,134,0.35),0_2px_3px_rgba(47,76,134,0.04)]">
          <div className="mb-6 flex items-center justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e4ebfa] bg-[#f5f8ff] text-[#2563eb] shadow-[inset_0_2px_0_#fff,0_5px_10px_-7px_#9aaed2]"><Icon size={23} strokeWidth={1.6} aria-hidden="true" /></span><span className="rounded-full bg-[#f1f5fc] px-3 py-1.5 text-xs text-[#67788f]">{item.status}</span></div>
          <p className="text-sm text-[#67788f]">{item.category}</p><a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-xl sm:text-2xl font-semibold tracking-[-0.035em] text-[#17263e] hover:text-[#2563eb]" aria-label={`${item.title}: ${t('Official documentation')}`}>{item.title}<ExternalLink size={14} className="text-[#9aaac0]" aria-hidden="true" /></a><p className="mt-3 text-base leading-7 text-[#67788f]">{item.description}</p>
        </article>)}
      </section>
      <details className="rounded-3xl border border-[#dce5f2] bg-white px-5 sm:px-7 shadow-[0_8px_28px_-22px_rgba(47,76,134,0.35)]">
        <summary className="cursor-pointer py-5 text-base font-medium text-[#67788f]">{t('Technical details and resources')}</summary>
        <div className="space-y-7 border-t border-[#e7edf7] py-6">
          <p className="text-sm leading-6 text-[#67788f]">{t('Configuration shows setup, not a successful provider connection. Planned features still need validation.')}</p>
          {hasUnavailableSources && !loading && <p role="status" className="text-sm text-[#67788f]">{t('Some runtime details are unavailable.')}</p>}
          <section aria-labelledby="runtime-heading"><h2 id="runtime-heading" className="mb-4 text-lg font-semibold">{t('Runtime measurements')}</h2><div className="grid sm:grid-cols-3 gap-4">{stages.map(stage => {
            const measurement = metrics?.[stage.key];
            const measured = typeof measurement?.count === 'number' && measurement.count > 0;
            return <div key={stage.key} className="rounded-2xl bg-[#f5f8ff] p-4"><p className="text-sm text-[#67788f]">{stage.label}</p><p className="mt-2 text-xl font-medium text-[#17263e]">{measured ? numberLabel(measurement?.p95Ms, ' ms') : t('Awaiting samples')}</p><p className="mt-2 text-xs text-[#67788f]">{measured ? t('p95 from {count} samples', { count: measurement?.count ?? 0 }) : t('No measured samples yet')}</p></div>;
          })}</div><p className="mt-3 text-sm text-[#67788f]">{t('Server timing does not measure the complete camera-to-warning journey.')}</p></section>
          <section aria-labelledby="model-heading"><h2 id="model-heading" className="text-lg font-semibold">{t('Model report')}</h2><p className="mt-2 text-sm text-[#67788f]">{model?.model || t('Not reported')}</p><div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{[
            { label: t('Reported mAP50'), value: typeof model?.training?.metrics?.mAP50 === 'number' ? `${(model.training.metrics.mAP50 * 100).toFixed(1)}%` : t('Not reported') },
            { label: t('Reported p50'), value: numberLabel(model?.benchmark?.latencyMetricsMs?.p50_median, ' ms') },
            { label: t('Reported device'), value: model?.benchmark?.device || t('Not reported') },
            { label: t('Export formats'), value: formats.length ? formats.join(' / ') : t('Not reported') },
          ].map(item => <div key={item.label} className="rounded-2xl bg-[#f5f8ff] p-4"><p className="text-sm text-[#67788f]">{item.label}</p><p className="mt-2 text-base font-medium">{item.value}</p></div>)}</div><p className="mt-3 text-sm text-[#67788f]">{t('Figures come from repository reports, not a phone benchmark run here.')}</p></section>
          <section aria-labelledby="resources-heading"><h2 id="resources-heading" className="mb-3 text-lg font-semibold">{t('Official resources')}</h2><div className="grid sm:grid-cols-2 gap-x-8">{resources.map(resource => <a key={resource.name} href={resource.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 border-t border-[#e7edf7] py-3 text-sm text-[#67788f] hover:text-[#2563eb]">{resource.name}<ExternalLink size={13} aria-hidden="true" /></a>)}</div><p className="mt-3 text-sm text-[#67788f]">{t('MargAI is an independent buildathon project. Resource links do not imply endorsement.')}</p></section>
        </div>
      </details>
    </div>
  );
};
