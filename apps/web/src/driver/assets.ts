/** Resolve model/runtime assets for localhost and project paths such as /MargAI/. */
export function visionAsset(path: string): string {
  return new URL(path.replace(/^\//, ''), new URL(import.meta.env.BASE_URL || '/', window.location.href)).href;
}
