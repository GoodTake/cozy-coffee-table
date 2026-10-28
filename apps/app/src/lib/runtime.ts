export interface ReleaseRuntimeContext {
  projectId: string;
  releaseId: string;
  generation: number;
}

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEV_PINNED_PREFIX_PATTERN = /^\/_releases\/[A-Za-z0-9_-]{1,128}\/_generations\/[1-9][0-9]{0,15}$/;

declare global {
  // Injected by the Live gateway before any application script executes.
  // Preview intentionally leaves it undefined and remains bound to Development.
  var __STEPS_RELEASE_CONTEXT__: unknown;
  // Set by `openstep dev` before any application script: the prefix its gateway strips, so a URL built here
  // reaches the backend locally exactly when it would on the live site. Preview and Live leave it unset.
  var __OPENSTEP_DEV_PINNED_PREFIX__: unknown;
}

export function parseReleaseRuntimeContext(
  value: unknown,
): ReleaseRuntimeContext | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.projectId !== 'string'
    || !PROJECT_ID_PATTERN.test(candidate.projectId)
    || typeof candidate.releaseId !== 'string'
    || !RELEASE_ID_PATTERN.test(candidate.releaseId)
    || !Number.isSafeInteger(candidate.generation)
    || (candidate.generation as number) <= 0
  ) {
    return null;
  }
  return {
    projectId: candidate.projectId,
    releaseId: candidate.releaseId,
    generation: candidate.generation as number,
  };
}

export function getReleaseRuntimeContext(): ReleaseRuntimeContext | null {
  const injected = globalThis.__STEPS_RELEASE_CONTEXT__;
  if (injected === undefined) return null;
  const context = parseReleaseRuntimeContext(injected);
  if (!context) throw new Error('steps_release_context_unavailable');
  return context;
}

export function isReleaseRuntime(): boolean {
  return getReleaseRuntimeContext() !== null;
}

export function releaseRuntimePath(
  path: `/${string}`,
  context: ReleaseRuntimeContext | null = getReleaseRuntimeContext(),
): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('invalid_runtime_path');
  }
  if (!context) {
    const prefix = globalThis.__OPENSTEP_DEV_PINNED_PREFIX__;
    return typeof prefix === 'string' && DEV_PINNED_PREFIX_PATTERN.test(prefix) ? prefix + path : path;
  }
  return `/_releases/${encodeURIComponent(context.releaseId)}`
    + `/_generations/${context.generation}${path}`;
}
