import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  DatasetManifest,
  NormalizationBlueprint,
  PersistenceResult,
  ValidationReport,
} from './types';

export interface BlobStorageRepository {
  uploadOriginal(datasetId: string, fileName: string, base64Content: string): Promise<string | null>;
  uploadNormalizedExport(datasetId: string, fileName: string, base64Content: string): Promise<string | null>;
}

export interface DatasetRepository {
  persistDataset(args: {
    manifest: DatasetManifest;
    blueprint: NormalizationBlueprint;
    normalizedData: Record<string, unknown>[];
    originalFileBase64: string;
    normalizedExportBase64: string;
  }): Promise<PersistenceResult>;
}

export interface NormalizedQueryRepository {
  getRows(sessionId: string): Promise<Record<string, unknown>[]>;
}

export interface ValidationRepository {
  saveValidation(sessionId: string, report: ValidationReport): Promise<void>;
}

export class NoopBlobStorageRepository implements BlobStorageRepository {
  async uploadOriginal(): Promise<string | null> {
    return null;
  }

  async uploadNormalizedExport(): Promise<string | null> {
    return null;
  }
}

export class LocalDatasetRepository implements DatasetRepository {
  async persistDataset(args: {
    manifest: DatasetManifest;
    blueprint: NormalizationBlueprint;
    normalizedData: Record<string, unknown>[];
    originalFileBase64: string;
    normalizedExportBase64: string;
  }): Promise<PersistenceResult> {
    void args.blueprint;
    void args.normalizedData;
    void args.originalFileBase64;
    void args.normalizedExportBase64;

    return {
      manifest: {
        ...args.manifest,
        status: 'READY',
        updatedAt: new Date().toISOString(),
      },
      storedOriginalPath: null,
      storedNormalizedPath: null,
      normalizedTableName: args.manifest.normalizedTableName,
    };
  }
}

export class SupabaseDatasetRepository implements DatasetRepository {
  private client: SupabaseClient | null;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;
  }

  async persistDataset(args: {
    manifest: DatasetManifest;
    blueprint: NormalizationBlueprint;
    normalizedData: Record<string, unknown>[];
    originalFileBase64: string;
    normalizedExportBase64: string;
  }): Promise<PersistenceResult> {
    void args.blueprint;
    void args.normalizedData;
    void args.originalFileBase64;
    void args.normalizedExportBase64;

    if (!this.client) {
      return {
        manifest: args.manifest,
        storedOriginalPath: null,
        storedNormalizedPath: null,
        normalizedTableName: args.manifest.normalizedTableName,
      };
    }

    return {
      manifest: args.manifest,
      storedOriginalPath: null,
      storedNormalizedPath: null,
      normalizedTableName: args.manifest.normalizedTableName,
    };
  }
}

