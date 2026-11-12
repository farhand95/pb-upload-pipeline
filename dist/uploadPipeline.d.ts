/**
 * Unified Image Upload Pipeline Core
 * Framework-agnostic single point of entry for all image uploads.
 * Handles rate limits, preflight checks, 5-tier compression, dual storage routing (R2 vs Supabase),
 * and safe error masking.
 */
import { type CompressionTier, type UploadPurpose } from './uploadConfig';
import { type CompressionPipelineResult } from './imageCompressor';
import { type R2ClientConfig } from './r2Client';
export type UploadStage = 'preflight' | 'compressing' | 'uploading' | 'finalizing';
export interface UploadPipelineOptions {
    file: File;
    purpose: UploadPurpose;
    tier?: CompressionTier;
    targetId?: string;
    precompressedResult?: CompressionPipelineResult;
    onProgress?: (progress: number, stage: UploadStage) => void;
    signal?: AbortSignal;
    userId?: string | number;
}
export interface UploadPipelineResult {
    success: true;
    url: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    size: number;
    originalSize: number;
    savedPercentage: number;
    mimeType: string;
    tierUsed: CompressionTier;
    purposeUsed: UploadPurpose;
    storagePath: string;
    thumbnailStoragePath?: string;
    qualityReached?: number;
    warning?: string;
}
export interface SupabaseStorageUploadClient {
    storage: {
        from: (bucket: string) => {
            upload: (path: string, fileBody: any, options?: any) => PromiseLike<{
                data: any;
                error: any;
            }>;
            createSignedUrl: (path: string, expiresIn: number) => PromiseLike<{
                data: {
                    signedUrl: string;
                } | null;
                error: any;
            }>;
            getPublicUrl: (path: string) => {
                data: {
                    publicUrl: string;
                };
            };
        };
    };
    from?: (table: string) => {
        insert: (values: any) => PromiseLike<any> | any;
    };
}
export interface UploadPipelineEnvironment {
    supabase?: SupabaseStorageUploadClient;
    r2?: R2ClientConfig;
    uploadEndpoint?: string;
    activeUserId?: string | number;
    zeroTrustHeader?: string;
}
export declare class UploadPipelineError extends Error {
    code: 'PREFLIGHT_ERROR' | 'CEILING_EXCEEDED' | 'RATE_LIMIT_EXCEEDED' | 'STORAGE_ERROR' | 'NETWORK_ERROR' | 'ABORTED';
    retryable: boolean;
    constructor(message: string, code: 'PREFLIGHT_ERROR' | 'CEILING_EXCEEDED' | 'RATE_LIMIT_EXCEEDED' | 'STORAGE_ERROR' | 'NETWORK_ERROR' | 'ABORTED', retryable?: boolean);
}
/**
 * Sanitizes errors to prevent exposing internal paths, credentials, or server internals.
 */
export declare function sanitizeErrorMessage(rawMessage: string): string;
/**
 * Executes full image compression and dual-storage upload pipeline.
 */
export declare function processAndUploadImage(options: UploadPipelineOptions, env: UploadPipelineEnvironment): Promise<UploadPipelineResult>;
/**
 * Factory to create an upload pipeline instance bound to specific environment configuration.
 */
export declare function createUploadPipeline(env: UploadPipelineEnvironment): {
    processAndUploadImage: (options: UploadPipelineOptions) => Promise<UploadPipelineResult>;
    getSignedAssetUrl: (bucket: string, path: string, expiresInSeconds?: number) => Promise<string>;
};
//# sourceMappingURL=uploadPipeline.d.ts.map