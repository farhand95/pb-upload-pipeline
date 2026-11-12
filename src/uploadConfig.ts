/**
 * Unified Upload & Compression Configuration Standards
 * Production configuration for multi-tier image compression, purpose profiles,
 * preflight limits, decompression-bomb guards, and abuse limits.
 */

export type CompressionTier = 'minimal' | 'light' | 'medium' | 'strong' | 'maximum' | 'original';

export type UploadPurpose = 'chat_image' | 'product_photo' | 'community_post' | 'payment_proof' | 'avatar' | 'product_review' | 'general';

export interface TierSettings {
	name: string;
	tierLevel: 1 | 2 | 3 | 4 | 5 | 0; // 3 = Medium (default)
	maxDimension: number; // Maximum longest-edge dimension in px (preserves aspect ratio, no upscaling)
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
export const COMPRESSION_TIERS: Record<CompressionTier, TierSettings> = {
	minimal: {
		name: 'Minimal',
		tierLevel: 1,
		maxDimension: 1440,
		maxWidth: 1440,
		maxHeight: 1440,
		initialQuality: 0.90,
		qualityFloor: 0.82,
		outputCeilingBytes: 1.5 * 1024 * 1024, // 1.5MB
		preferredFormat: 'image/webp',
		description: 'Preserve the most detail (1440px) for product gallery master photos and woodcraft textures'
	},
	light: {
		name: 'Light',
		tierLevel: 2,
		maxDimension: 1080,
		maxWidth: 1080,
		maxHeight: 1080,
		initialQuality: 0.84,
		qualityFloor: 0.74,
		outputCeilingBytes: 750 * 1024, // 750KB
		preferredFormat: 'image/webp',
		description: 'Light compression (1080px) ensuring high legibility for bank transfer proofs & catalog specs'
	},
	medium: {
		name: 'Medium', // DEFAULT TIER
		tierLevel: 3,
		maxDimension: 720,
		maxWidth: 720,
		maxHeight: 720,
		initialQuality: 0.78,
		qualityFloor: 0.65,
		outputCeilingBytes: 350 * 1024, // 350KB
		preferredFormat: 'image/webp',
		description: 'Default balanced tier (720px) for mobile chat consultation photos and community posts'
	},
	strong: {
		name: 'Strong',
		tierLevel: 4,
		maxDimension: 384,
		maxWidth: 384,
		maxHeight: 384,
		initialQuality: 0.70,
		qualityFloor: 0.50,
		outputCeilingBytes: 120 * 1024, // 120KB
		preferredFormat: 'image/webp',
		description: 'Strong compression (384px) for compact reference thumbnails and lightweight mobile previews'
	},
	maximum: {
		name: 'Maximum',
		tierLevel: 5,
		maxDimension: 128,
		maxWidth: 128,
		maxHeight: 128,
		initialQuality: 0.65,
		qualityFloor: 0.40,
		outputCeilingBytes: 35 * 1024, // 35KB
		preferredFormat: 'image/webp',
		description: 'Maximum footprint reduction (128px) strictly for square-cropped avatars and micro assets'
	},
	original: {
		name: 'Original (Sanitized)',
		tierLevel: 0,
		maxDimension: 4096,
		maxWidth: 4096,
		maxHeight: 4096,
		initialQuality: 0.94,
		qualityFloor: 0.88,
		outputCeilingBytes: 6 * 1024 * 1024, // 6MB
		preferredFormat: 'image/webp',
		description: 'Original quality bounds (4096px) with full EXIF sanitization and security validation'
	}
};

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
export const PURPOSE_PROFILES: Record<UploadPurpose, PurposeProfile> = {
	chat_image: {
		purpose: 'chat_image',
		defaultTier: 'medium', // 720px full chat image
		rawInputLimitBytes: 15 * 1024 * 1024, // 15MB input ceiling
		outputCeilingBytes: 350 * 1024, // 350KB output
		thumbnailWidth: 192,
		thumbnailHeight: 192,
		thumbnailQuality: 0.55,
		thumbnailCeilingBytes: 25 * 1024,
		rateLimit: {
			maxPerMinute: 6,
			cooldownSeconds: 60
		}
	},
	product_photo: {
		purpose: 'product_photo',
		defaultTier: 'minimal', // 1440px for rich grain and finish detail
		rawInputLimitBytes: 25 * 1024 * 1024, // 25MB input ceiling
		outputCeilingBytes: 1.5 * 1024 * 1024,
		thumbnailWidth: 320,
		thumbnailHeight: 320,
		thumbnailQuality: 0.65,
		thumbnailCeilingBytes: 45 * 1024,
		rateLimit: {
			maxPerMinute: 20,
			cooldownSeconds: 60
		}
	},
	community_post: {
		purpose: 'community_post',
		defaultTier: 'medium', // 720px
		rawInputLimitBytes: 15 * 1024 * 1024,
		outputCeilingBytes: 350 * 1024,
		thumbnailWidth: 240,
		thumbnailHeight: 240,
		thumbnailQuality: 0.60,
		thumbnailCeilingBytes: 35 * 1024,
		rateLimit: {
			maxPerMinute: 4,
			cooldownSeconds: 60
		}
	},
	product_review: {
		purpose: 'product_review',
		defaultTier: 'medium', // 720px for customer order unboxing & reviews
		rawInputLimitBytes: 15 * 1024 * 1024,
		outputCeilingBytes: 350 * 1024,
		thumbnailWidth: 240,
		thumbnailHeight: 240,
		thumbnailQuality: 0.60,
		thumbnailCeilingBytes: 35 * 1024,
		rateLimit: {
			maxPerMinute: 6,
			cooldownSeconds: 60
		}
	},
	payment_proof: {
		purpose: 'payment_proof',
		defaultTier: 'medium', // 720px streamlined formality (real check via banking mutation)
		rawInputLimitBytes: 15 * 1024 * 1024,
		outputCeilingBytes: 350 * 1024,
		thumbnailWidth: 240,
		thumbnailHeight: 240,
		thumbnailQuality: 0.55,
		thumbnailCeilingBytes: 25 * 1024,
		preserveTextDetail: true,
		rateLimit: {
			maxPerMinute: 4,
			cooldownSeconds: 60
		}
	},
	avatar: {
		purpose: 'avatar',
		defaultTier: 'maximum', // 128px maximum
		rawInputLimitBytes: 10 * 1024 * 1024,
		outputCeilingBytes: 35 * 1024,
		thumbnailWidth: 64, // Reconciled avatar thumbnail (<= 128px)
		thumbnailHeight: 64,
		thumbnailQuality: 0.50,
		thumbnailCeilingBytes: 8 * 1024,
		rateLimit: {
			maxPerMinute: 3,
			cooldownSeconds: 60
		}
	},
	general: {
		purpose: 'general',
		defaultTier: 'medium', // 720px default fallback
		rawInputLimitBytes: 15 * 1024 * 1024,
		outputCeilingBytes: 350 * 1024,
		thumbnailWidth: 192,
		thumbnailHeight: 192,
		thumbnailQuality: 0.55,
		thumbnailCeilingBytes: 25 * 1024,
		rateLimit: {
			maxPerMinute: 8,
			cooldownSeconds: 60
		}
	}
};

/**
 * Security Invariants & Decompression Bomb Thresholds
 */
export const SECURITY_INVARIANTS = {
	MAX_TOTAL_PIXELS: 48_000_000, // 48 Megapixels limit (guards against decompression bombs)
	MAX_DIMENSION: 8192,          // 8192px maximum width or height
	ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const,
	ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.avif'] as const
};
