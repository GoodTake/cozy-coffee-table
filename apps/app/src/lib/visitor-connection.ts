/**
 * A visitor's own connected account, for pages: for a connector the App declares as each visitor's own
 * (`"subject": "visitor"`), the person using the App connects their own account and picks their own files in a window
 * on the platform, and the App's backend then calls the connector for them.
 *
 * Platform-owned: the platform rewrites this file in every App, so Apps built before it, and their copies, have it. It
 * imports nothing; an App's own `./platform` may predate it.
 */

export class VisitorConnectionError extends Error {
  constructor(
    public readonly code: 'popup_blocked' | 'network_error' | 'runtime_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'VisitorConnectionError';
  }
}

/**
 * Whether the person using the App connected their own account for the connector, and its `status`: `active`,
 * `needs_reconnect` or `needs_more_access` once they connected (`connected` also needs a file picked for every slot),
 * null before. `host_unsupported` where the platform does not identify the visitor -- the public address, the Preview,
 * a custom domain, `openstep dev` -- and `read_only` while the visitor is only viewing the App.
 */
export interface MyConnection {
  connected: boolean;
  status: string | null;
}

const visitorConnectorPath = (connectorId: string, suffix = '') =>
  `/__steps/connectors/${encodeURIComponent(connectorId)}${suffix}`;

/** The App host's answer, with the platform origin the connect window posts from (null where none can open). */
async function readMyConnection(connectorId: string): Promise<MyConnection & { platformOrigin: string | null }> {
  let res: Response;
  try {
    res = await fetch(visitorConnectorPath(connectorId), { credentials: 'same-origin' });
  } catch {
    throw new VisitorConnectionError('network_error', 'platform unreachable');
  }
  const body = (await res.json().catch(() => null)) as
    | { connected?: unknown; status?: unknown; platformOrigin?: unknown; error?: unknown }
    | null;
  if (res.ok && typeof body?.connected === 'boolean' && typeof body.platformOrigin === 'string') {
    return {
      connected: body.connected,
      status: typeof body.status === 'string' ? body.status : null,
      platformOrigin: body.platformOrigin,
    };
  }
  // The public address and the Preview answer 404, a custom domain says so, the local dev gateway refuses the path.
  if (res.status === 404 || body?.error === 'connector_visitor_host_unsupported'
    || (res.status === 403 && body?.error === 'forbidden')) {
    return { connected: false, status: 'host_unsupported', platformOrigin: null };
  }
  if (body?.error === 'read_only') return { connected: false, status: 'read_only', platformOrigin: null };
  throw new VisitorConnectionError('runtime_unavailable', `status ${res.status}`);
}

/** Whether the person using the App has connected their own account for `connectorId` (see MyConnection). */
export async function myConnection(connectorId: string): Promise<MyConnection> {
  const { connected, status } = await readMyConnection(connectorId);
  return { connected, status };
}

/**
 * Lets the person using the App connect their own account for `connectorId` and pick their own files, in a window on
 * the platform. Call it directly in a click handler, before any `await`: it opens that window at once, or the browser
 * blocks it (`popup_blocked`). Resolves once the window is done or closed, with what `myConnection` then says.
 */
export async function connectMyAccount(connectorId: string): Promise<{ connected: boolean }> {
  const popup = window.open(visitorConnectorPath(connectorId, '/connect'), `steps-connect-${connectorId}`,
    'popup,width=520,height=720');
  if (!popup) throw new VisitorConnectionError('popup_blocked', 'the browser blocked the window that connects the account');
  let platformOrigin: string | null;
  try {
    ({ platformOrigin } = await readMyConnection(connectorId));
  } catch (error) {
    popup.close();
    throw error;
  }
  if (platformOrigin === null) {
    popup.close();
    return { connected: false };
  }
  await new Promise<void>((resolve) => {
    const finish = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closedCheck);
      resolve();
    };
    // Only the window this call opened, once it is on the platform's page: any other window may post here too.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; connectorId?: unknown } | null;
      if (event.source === popup && event.origin === platformOrigin
        && data?.type === 'steps-connector-visitor' && data.connectorId === connectorId) finish();
    };
    window.addEventListener('message', onMessage);
    const closedCheck = setInterval(() => { if (popup.closed) finish(); }, 500);
  });
  // The message only says when to look: whether the account is connected is the App host's to say.
  return { connected: (await myConnection(connectorId)).connected };
}
