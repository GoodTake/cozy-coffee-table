/**
 * Platform runtime services SDK.
 *
 * Preview calls are attributed from the project Host. Live calls use the
 * release-pinned same-origin runtime route; they fail closed while a platform
 * capability is unavailable on that route.
 *
 * Billing: each call consumes the project's free monthly quota first, then is
 * charged to the App owner's platform balance. Handle PlatformError and degrade
 * gracefully (e.g. hide the AI feature) instead of crashing the page.
 */

import { releaseRuntimePath } from './runtime';

export class PlatformError extends Error {
  constructor(
    public readonly code:
      | 'disabled'
      | 'insufficient_balance'
      | 'rate_limited'
      | 'input_too_large'
      | 'invalid_schema'
      | 'origin_denied'
      | 'runtime_unavailable'
      | 'llm_error'
      | 'network_error'
      | 'invalid_email'
      | 'email_error'
      | 'template_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

const PLATFORM_ERROR_CODES = new Set<PlatformError['code']>([
  'disabled',
  'insufficient_balance',
  'rate_limited',
  'input_too_large',
  'invalid_schema',
  'origin_denied',
  'runtime_unavailable',
  'llm_error',
  'network_error',
  'invalid_email',
  'email_error',
  'template_not_found',
]);

function platformErrorCode(
  status: number,
  code: string | undefined,
  fallback: PlatformError['code'] = 'llm_error',
): PlatformError['code'] {
  if (status === 501 || code === 'runtime_surface_unavailable') {
    return 'runtime_unavailable';
  }
  return code && PLATFORM_ERROR_CODES.has(code as PlatformError['code'])
    ? code as PlatformError['code']
    : fallback;
}

export interface InvokeAIArgs {
  prompt: string;
  system?: string;
}

export interface InvokeAIWithSchemaArgs extends InvokeAIArgs {
  /** Bounded JSON schema (object/array/string/number/integer/boolean/enum, depth ≤ 4). */
  schema: object;
}

export async function invokeAI(args: InvokeAIWithSchemaArgs): Promise<unknown>;
export async function invokeAI(args: InvokeAIArgs): Promise<string>;
export async function invokeAI(args: InvokeAIArgs & { schema?: object }): Promise<unknown> {
  let endpoint: string;
  try {
    endpoint = releaseRuntimePath('/_platform/ai/invoke');
  } catch {
    throw new PlatformError('runtime_unavailable', 'platform runtime unavailable');
  }
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: args.prompt, system: args.system, schema: args.schema }),
    });
  } catch {
    throw new PlatformError('network_error', 'platform unreachable');
  }
  const body = (await res.json().catch(() => null)) as
    | { kind: 'text'; text: string }
    | { kind: 'json'; data: unknown }
    | { error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    const code = platformErrorCode(res.status, err?.code);
    throw new PlatformError(code, err?.message ?? `status ${res.status}`);
  }
  if (body && 'kind' in body) return body.kind === 'json' ? body.data : body.text;
  throw new PlatformError('llm_error', 'malformed platform response');
}

export interface SendEmailArgs {
  /** Id of a template registered with `npm run email:template`. */
  template: string;
  to: string | string[];
  /** Values for the template's declared slots. */
  data?: Record<string, string>;
  /** Where replies go. The platform sender does not accept replies. */
  replyTo?: string;
}

/**
 * Send one transactional email from a registered template. At most 5
 * recipients. The subject and body come from the template — this call only
 * supplies the slot values, which the platform escapes and bounds.
 *
 * By default the message goes out from the platform sender with a footer
 * identifying this app, and consumes the project's free monthly quota, then SSU. A per-project
 * daily cap applies — handle `rate_limited` as a normal state, not an error to
 * retry in a loop. A `template` that was never synced throws
 * `template_not_found` — run `npm run email:template`, don't retry.
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ id: string }> {
  let endpoint: string;
  try {
    endpoint = releaseRuntimePath('/_platform/email/send');
  } catch {
    throw new PlatformError('runtime_unavailable', 'platform runtime unavailable');
  }
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        template: args.template,
        to: args.to,
        data: args.data ?? {},
        replyTo: args.replyTo,
      }),
    });
  } catch {
    throw new PlatformError('network_error', 'platform unreachable');
  }
  const body = (await res.json().catch(() => null)) as
    | { id: string }
    | { error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new PlatformError(platformErrorCode(res.status, err?.code, 'email_error'), err?.message ?? `status ${res.status}`);
  }
  if (body && 'id' in body && typeof body.id === 'string') return { id: body.id };
  throw new PlatformError('email_error', 'malformed platform response');
}
