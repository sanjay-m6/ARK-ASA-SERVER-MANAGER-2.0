// ============================================================================
// Mod Collections API Methods — Desktop App
// High-level methods for publishing, fetching, updating, and deleting collections
// ============================================================================

import { apiRequest, API_CONFIG } from './client';
import { ValidationError } from './errors';
import type {
  CreateCollectionPayload,
  UpdateCollectionPayload,
  CreateCollectionResponseData,
  CollectionResponseData,
} from '../../types/mod-collection.types';

// ---------------------------------------------------------------------------
// Publish (Create) Collection
// ---------------------------------------------------------------------------

export async function publishCollection(
  payload: CreateCollectionPayload
): Promise<CreateCollectionResponseData> {
  // Basic local validation before sending
  if (!payload.collection.name || payload.collection.name.trim().length < 3) {
    throw new ValidationError('Collection name must be at least 3 characters.', 'name');
  }
  if (payload.collection.categories.length === 0 && payload.collection.mods.length === 0) {
    throw new ValidationError('Collection must have at least one category or mod.');
  }

  const response = await apiRequest<CreateCollectionResponseData>({
    method: 'POST',
    path: '/mod-collections',
    body: payload,
  });

  if (!response.success) throw new Error('Failed to publish collection');

  return response.data;
}

// ---------------------------------------------------------------------------
// Get Collection (Public)
// ---------------------------------------------------------------------------

export async function getCollection(shareId: string): Promise<CollectionResponseData> {
  if (!shareId || shareId.length < 4) {
    throw new ValidationError('Invalid share ID format.');
  }

  const response = await apiRequest<CollectionResponseData>({
    method: 'GET',
    path: `/mod-collections/${encodeURIComponent(shareId)}`,
  });

  if (!response.success) throw new Error('Collection not found');

  return response.data;
}

// ---------------------------------------------------------------------------
// Update Collection
// ---------------------------------------------------------------------------

export async function updateCollection(
  shareId: string,
  managementToken: string,
  payload: UpdateCollectionPayload
): Promise<CollectionResponseData> {
  const response = await apiRequest<CollectionResponseData>({
    method: 'PATCH',
    path: `/mod-collections/${encodeURIComponent(shareId)}`,
    body: payload,
    token: managementToken,
  });

  if (!response.success) throw new Error('Failed to update collection');

  return response.data;
}

// ---------------------------------------------------------------------------
// Delete Collection
// ---------------------------------------------------------------------------

export async function deleteCollection(
  shareId: string,
  managementToken: string
): Promise<boolean> {
  const response = await apiRequest<{ deleted: boolean }>({
    method: 'DELETE',
    path: `/mod-collections/${encodeURIComponent(shareId)}`,
    token: managementToken,
  });

  return response.success;
}

// ---------------------------------------------------------------------------
// Extract Share ID from URL
// ---------------------------------------------------------------------------

/**
 * Extract a shareId from a URL like:
 * https://www.arkservermanager.app/mods/mc-x7k29abc
 * Returns null if the URL doesn't match the expected pattern.
 */
export function extractShareIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    // Expected: /mods/<shareId>
    if (pathParts.length >= 2 && pathParts[0] === 'mods') {
      const shareId = pathParts[1];
      // Validate format: alphanumeric + hyphens/underscores, 4-30 chars
      if (/^[a-zA-Z0-9_-]{4,30}$/.test(shareId)) {
        return shareId;
      }
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/**
 * Check if a string looks like a collection share URL
 */
export function isCollectionShareUrl(input: string): boolean {
  return extractShareIdFromUrl(input) !== null;
}

// ---------------------------------------------------------------------------
// Generate Share URL
// ---------------------------------------------------------------------------

export function generateShareUrl(shareId: string): string {
  return `${API_CONFIG.webUrl}/mods/${shareId}`;
}
