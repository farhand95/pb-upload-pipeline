/**
 * Unified Image Compression Engine
 * 5-Tier Reusable Client-Side Compression Utility with Purpose Profiles,
 * Dual Thumbnail Generation, Quality Floor Safeguards, and Decompression-Bomb Protection.
 */
import { type CompressionTier, type UploadPurpose } from './uploadConfig';
export interface CompressPipelineOptions {
    tier?: CompressionTier;
    purpose?: UploadPurpose;
    generateThumbnail?: boolean;
    customMaxDimension?: number;
    customMaxWidth?: number;
    customMaxHeight?: number;
    customQuality?: number;
    customCeilingBytes?: number;
    signal?: AbortSignal;
}
export interface CompressedArtifact {
    file: File;
    blob: Blob;
    size: number;
    width: number;
    height: number;
    previewUrl: string;
    mimeType: string;
    qualityReached?: number;
    ceilingMet?: boolean;
    warning?: string;
}
export interface CompressionPipelineResult {
    primary: CompressedArtifact;
    thumbnail?: CompressedArtifact;
    tierUsed: CompressionTier;
    purposeUsed: UploadPurpose;
    originalSize: number;
    totalSavedBytes: number;
    savedPercentage: number;
    ceilingMet: boolean;
    qualityReached?: number;
    warning?: string;
    durationMs: number;
}
export declare function formatFileSize(bytes: number): string;
/**
 * Universal Compression Pipeline:
 * Validates, strips metadata, proportionally downsamples, generates dual outputs,
 * and enforces quality floors without direct upload bypass.
 */
export declare function compressImagePipeline(rawFile: File, options?: CompressPipelineOptions): Promise<CompressionPipelineResult>;
export declare function compressImage(file: File, options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    targetFormat?: any;
}): Promise<{
    file: File;
    blob: Blob;
    previewUrl: string;
    compressedSize: number;
    originalSize: number;
    savedPercentage: number;
    width: number;
    height: number;
}>;
export declare function compressPaymentProof(file: File): Promise<{
    file: File;
    blob: Blob;
    previewUrl: string;
    compressedSize: number;
    originalSize: number;
    savedPercentage: number;
    width: number;
    height: number;
}>;
export declare function compressCommunityImage(file: File): Promise<{
    file: File;
    blob: Blob;
    previewUrl: string;
    compressedSize: number;
    originalSize: number;
    savedPercentage: number;
    width: number;
    height: number;
}>;
//# sourceMappingURL=imageCompressor.d.ts.map