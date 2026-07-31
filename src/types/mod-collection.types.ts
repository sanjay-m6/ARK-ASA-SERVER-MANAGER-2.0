// ============================================================================
// Mod Collection Sharing — Desktop App Type Definitions
// Types for the website API integration and local published state
// ============================================================================

/** Current schema version for collection payloads */
export const CURRENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Core Collection Shapes (mirrors website types)
// ---------------------------------------------------------------------------

/** A category within a shared mod collection */
export interface SharedCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  sortOrder: number;
  modIds: string[];
}

/** A mod entry within a shared collection */
export interface SharedMod {
  id: string;
  name?: string;
  thumbnailUrl?: string;
}

/** Source metadata about the application that created the collection */
export interface CollectionSource {
  application: string;
  appVersion?: string;
  platform?: string;
}

// ---------------------------------------------------------------------------
// API Request / Response Types
// ---------------------------------------------------------------------------

/** POST body for creating a new collection */
export interface CreateCollectionPayload {
  schemaVersion: number;
  collection: {
    name: string;
    description?: string;
    game: string;
    categories: SharedCategory[];
    mods: SharedMod[];
  };
  source?: CollectionSource;
}

/** PATCH body for updating an existing collection */
export interface UpdateCollectionPayload {
  collection?: {
    name?: string;
    description?: string;
    categories?: SharedCategory[];
    mods?: SharedMod[];
  };
}

/** Successful creation response data */
export interface CreateCollectionResponseData {
  shareId: string;
  shareUrl: string;
  managementToken: string;
  createdAt: string;
}

/** Full collection data returned by GET */
export interface CollectionResponseData {
  shareId: string;
  name: string;
  description: string | null;
  game: string;
  schemaVersion: number;
  categories: SharedCategory[];
  mods: SharedMod[];
  source: CollectionSource | null;
  visibility: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API Envelope
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Desktop-Specific Types
// ---------------------------------------------------------------------------

/** Stored locally after a collection has been published to the website */
export interface PublishedCollectionMeta {
  shareId: string;
  managementToken: string;
  shareUrl: string;
  publishedAt: string;
  lastUpdatedAt: string;
}

/** API URL configuration */
export interface WebsiteApiConfig {
  baseUrl: string;
  webUrl: string;
  timeout: number;
}
