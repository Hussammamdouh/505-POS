export class NetworkError extends Error {
  constructor(message = 'The server could not be reached.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiConfig {
  getBaseUrl: () => string | null;
  getToken: () => string | null;
  onReachability: (reachable: boolean) => void;
  onUnauthorized: () => void;
}

let config: ApiConfig = {
  getBaseUrl: () => null,
  getToken: () => null,
  onReachability: () => {},
  onUnauthorized: () => {},
};

export function configureApi(next: ApiConfig) {
  config = next;
}

interface RequestOptions {
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function apiRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = config.getBaseUrl();
  if (!baseUrl) {
    throw new NetworkError('The server address is not set. Open Settings.');
  }

  const token = options.token === undefined ? config.getToken() : options.token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    config.onReachability(false);
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  config.onReachability(true);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    if (response.status === 401 && token) {
      config.onUnauthorized();
    }

    const title = typeof payload?.title === 'string' ? payload.title : `Request failed (${response.status}).`;
    throw new ApiError(response.status, title);
  }

  return payload as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong.';
