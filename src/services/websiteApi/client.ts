// ============================================================================
// Website API Client — Reusable HTTP Client for the Desktop App
// Handles requests to the arkservermanager.app REST API
// ============================================================================

import type { ApiResponse } from '../../types/mod-collection.types';
import { ApiError, NetworkError } from './errors';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = 'https://www.arkservermanager.app/api/v1';
const DEFAULT_WEB_URL = 'https://www.arkservermanager.app';
const DEFAULT_TIMEOUT_MS = 15000;

function getApiBaseUrl(): string {
  // Check for dev override via Vite env
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv.VITE_ARK_MANAGER_API_URL) {
    return metaEnv.VITE_ARK_MANAGER_API_URL;
  }
  // In local Vite/Tauri development mode, default to localhost:3000
  if (metaEnv && metaEnv.DEV) {
    return 'http://localhost:3000/api/v1';
  }
  return DEFAULT_API_URL;
}

function getWebBaseUrl(): string {
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv.VITE_ARK_MANAGER_WEB_URL) {
    return metaEnv.VITE_ARK_MANAGER_WEB_URL;
  }
  if (metaEnv && metaEnv.DEV) {
    return 'http://localhost:3000';
  }
  return DEFAULT_WEB_URL;
}

export const API_CONFIG = {
  get apiUrl() { return getApiBaseUrl(); },
  get webUrl() { return getWebBaseUrl(); },
  timeout: DEFAULT_TIMEOUT_MS,
};

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  timeoutMs?: number;
}

/**
 * Make an HTTP request to the website API.
 * Returns the parsed ApiResponse or throws ApiError / NetworkError.
 */
export async function apiRequest<T>(options: RequestOptions): Promise<ApiResponse<T>> {
  const { method, path, body, token, timeoutMs = API_CONFIG.timeout } = options;
  const url = `${API_CONFIG.apiUrl}${path}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = await response.json() as ApiResponse<T>;

    if (!response.ok && !json.success) {
      throw new ApiError(
        json.success === false ? json.error.message : `HTTP ${response.status}`,
        response.status,
        json.success === false ? json.error.code : 'UNKNOWN_ERROR'
      );
    }

    return json;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('Request timed out. The website may be unavailable.');
    }

    if (error instanceof TypeError) {
      // Network errors (DNS failure, CORS, offline)
      throw new NetworkError('Unable to reach the website. Check your internet connection.');
    }

    throw new NetworkError(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

/**
 * Quick health check — can we reach the API?
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_CONFIG.apiUrl}/mod-collections`, {
      method: 'HEAD',
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    // Any response (even 405 Method Not Allowed) means the server is reachable
    return response !== null;
  } catch {
    return false;
  }
}
