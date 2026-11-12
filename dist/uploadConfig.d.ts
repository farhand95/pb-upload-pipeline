/**
 * Unified Upload & Compression Configuration Standards
 * Production configuration for multi-tier image compression, purpose profiles,
 * preflight limits, decompression-bomb guards, and abuse limits.
 */
export type CompressionTier = 'minimal' | 'light' | 'medium' | 'strong' | 'maximum' | 'original';
export type UploadPurpose = 'chat_image' | 'product_photo' | 'community_post' | 'payment_proof' | 'avatar' | 'product_review' | 'general';
export interface TierSettings {
    name: string;
    tierLevel: 1 | 2 | 3 | 4 | 5 | 0;
    maxDimension: number;
    maxWidth: number;
    maxHeight: number;
    initialQuality: number;
    qualityFloor: number;
    outputCeilingBytes: number;
    preferredFormat: 'image/webp' | 'image/avif' | 'image/jpeg';
    description: string;
}
export interface PurposeProfile {
    purpose: UploadPurpose;
    defaultTier: CompressionTier;
    rawInputLimitBytes: number;
    outputCeilingBytes: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
    thumbnailQuality: number;
    thumbnailCeilingBytes: number;
    preserveTextDetail?: boolean;
    rateLimit: {
        maxPerMinute: number;
        cooldownSeconds: number;
    };
}
/**
 * 5 Clearly Named Tiers (with Tier 3 Medium as default fallback):
 * - Tier 1 Minimal: 1440 px longest-edge
 * - Tier 2 Light: 1080 px longest-edge
 * - Tier 3 Medium (default): 720 px longest-edge
 * - Tier 4 Strong: 384 px longest-edge
 * - Tier 5 Maximum: 128 px longest-edge (avatars & micro-assets only)
 */
export declare const COMPRESSION_TIERS: Record<CompressionTier, TierSettings>;
/**
 * Purpose Profiles with deliberate tier mappings:
 * - product_photo: Tier 1 Minimal (1440px) preserving woodcraft grain & joinery detail
 * - payment_proof: Tier 3 Medium (720px) streamlined formality transfer slip (audit relies on banking mutations)
 * - product_review: Tier 3 Medium (720px) order evaluation & customer photos
 * - chat_image: Tier 3 Medium (720px) with dedicated 192px thumbnail generation
 * - community_post: Tier 3 Medium (720px) balanced for mobile social feed
 * - avatar: Tier 5 Maximum (128px) with reconciled 64px micro-thumbnail
 * - general: Tier 3 Medium (720px) default fallback
 */
export declare const PURPOSE_PROFILES: Record<UploadPurpose, PurposeProfile>;
/**
 * Security Invariants & Decompression Bomb Thresholds
 */
export declare const SECURITY_INVARIANTS: {
    MAX_TOTAL_PIXELS: number;
    MAX_DIMENSION: number;
    ALLOWED_MIME_TYPES: readonly ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    ALLOWED_EXTENSIONS: readonly ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
};
//# sourceMappingURL=uploadConfig.d.ts.map