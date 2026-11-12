/**
 * Unified Image Upload Pipeline Core
 * Framework-agnostic single point of entry for all image uploads.
 * Handles rate limits, preflight checks, 5-tier compression, dual storage routing (R2 vs Supabase),
 * and safe error masking.
 */

import {
	PURPOSE_PROFILES,
	SECURITY_INVARIANTS,
	type CompressionTier,
	type UploadPurpose,
	type PurposeProfile
} from './uploadConfig';
import {
	compressImagePipeline,
	formatFileSize,
	type CompressionPipelineResult
} from './imageCompressor';
import { uploadToR2, type R2ClientConfig, type R2UploadResult } from './r2Client';

export type UploadStage = 'preflight' | 'compressing' | 'uploading' | 'finalizing';

export interface UploadPipelineOptions {
	file: File;
	purpose: UploadPurpose;
	tier?: CompressionTier;
	targetId?: string; // conversation/threadId, orderId, productId, etc.
	precompressedResult?: CompressionPipelineResult; // Reusable client result preventing duplicate compression
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
			upload: (
				path: string,
				fileBody: Blob | ArrayBuffer | Uint8Array,
				options?: {
					contentType?: string;
					cacheControl?: string;
					upsert?: boolean;
					headers?: Record<string, string>;
				}
			) => Promise<{ data: any; error: any }>;
			createSignedUrl: (
				path: string,
				expiresIn: number
			) => Promise<{ data: { signedUrl: string } | null; error: any }>;
			getPublicUrl: (
				path: string
			) => { data: { publicUrl: string } };
		};
	};
	from?: (table: string) => {
		insert: (values: any) => Promise<{ data: any; error: any }>;
	};
}

export interface UploadPipelineEnvironment {
	supabase?: SupabaseStorageUploadClient;
	r2?: R2ClientConfig;
	activeUserId?: string | number;
	zeroTrustHeader?: string;
}

export class UploadPipelineError extends Error {
	constructor(
		message: string,
		public code: 'PREFLIGHT_ERROR' | 'CEILING_EXCEEDED' | 'RATE_LIMIT_EXCEEDED' | 'STORAGE_ERROR' | 'NETWORK_ERROR' | 'ABORTED',
		public retryable: boolean = true
	) {
		super(message);
		this.name = 'UploadPipelineError';
	}
}

// In-memory sliding window rate-limiter per purpose
const uploadTimestamps: Map<string, number[]> = new Map();

function checkRateLimit(purpose: UploadPurpose, profile: PurposeProfile): void {
	const now = Date.now();
	const windowMs = (profile.rateLimit.cooldownSeconds || 60) * 1000;
	const history = uploadTimestamps.get(purpose) || [];

	const validHistory = history.filter((ts) => now - ts < windowMs);
	if (validHistory.length >= profile.rateLimit.maxPerMinute) {
		const oldestValid = validHistory[0];
		const remainingSeconds = Math.ceil((windowMs - (now - oldestValid)) / 1000);
		throw new UploadPipelineError(
			`Batas kecepatan unggah tercapai (${profile.rateLimit.maxPerMinute} foto/menit). Harap tunggu ${remainingSeconds} detik sebelum mencoba lagi.`,
			'RATE_LIMIT_EXCEEDED',
			true
		);
	}

	validHistory.push(now);
	uploadTimestamps.set(purpose, validHistory);
}

/**
 * Sanitizes errors to prevent exposing internal paths, credentials, or server internals.
 */
export function sanitizeErrorMessage(rawMessage: string): string {
	if (!rawMessage) return 'Gagal memproses berkas gambar.';
	return rawMessage
		.replace(/[\/\\][a-zA-Z0-9_\-\.\/\\:]+/g, '[protected-path]')
		.replace(/relation "[^"]+"/g, 'data store')
		.replace(/key "[^"]+"/g, 'identifier');
}

/**
 * Executes full image compression and dual-storage upload pipeline.
 */
export async function processAndUploadImage(
	options: UploadPipelineOptions,
	env: UploadPipelineEnvironment
): Promise<UploadPipelineResult> {
	const { file, purpose, tier, targetId, onProgress, signal } = options;

	const activeUserId = options.userId ?? env.activeUserId ?? 'anonymous';
	const profile = PURPOSE_PROFILES[purpose] || PURPOSE_PROFILES.general;

	// Stage 1: Preflight Check
	onProgress?.(5, 'preflight');
	checkRateLimit(purpose, profile);

	if (file.size > profile.rawInputLimitBytes) {
		throw new UploadPipelineError(
			`Ukuran file (${formatFileSize(file.size)}) melebihi batas yang diizinkan (${formatFileSize(profile.rawInputLimitBytes)}).`,
			'PREFLIGHT_ERROR',
			false
		);
	}

	const extLower = '.' + (file.name.split('.').pop() || '').toLowerCase();
	if (!SECURITY_INVARIANTS.ALLOWED_EXTENSIONS.includes(extLower as any)) {
		throw new UploadPipelineError(
			`Format ekstensi '${extLower}' tidak diizinkan. Hanya format JPG, PNG, WebP, dan AVIF yang diperbolehkan.`,
			'PREFLIGHT_ERROR',
			false
		);
	}

	// Stage 2: Compression Engine
	onProgress?.(25, 'compressing');

	const compressionResult = options.precompressedResult
		? options.precompressedResult
		: await compressImagePipeline(file, {
				tier,
				purpose,
				signal
		  });

	const primaryArtifact = compressionResult.primary;

	// Hard backstop limit
	const hardCeilingLimit = Math.min(
		profile.rawInputLimitBytes,
		Math.max(profile.outputCeilingBytes * 2.5, 4 * 1024 * 1024)
	);
	if (primaryArtifact.size > hardCeilingLimit) {
		throw new UploadPipelineError(
			`Berkas hasil kompresi (${formatFileSize(primaryArtifact.size)}) melebihi batas penyimpanan absolut (${formatFileSize(hardCeilingLimit)}).`,
			'CEILING_EXCEEDED',
			true
		);
	}

	// Stage 3: Secure Object Storage Upload
	onProgress?.(55, 'uploading');

	if (signal?.aborted) {
		throw new UploadPipelineError('Unggah dibatalkan oleh pengguna.', 'ABORTED', false);
	}

	const uniqueToken = crypto.randomUUID();
	const sanitizedUserId = String(activeUserId).replace(/[^a-zA-Z0-9_-]/g, '_');
	const safeFeature = purpose.replace(/[^a-zA-Z0-9_-]/g, '_');
	const ext = primaryArtifact.mimeType === 'image/webp' ? 'webp' : 'jpg';

	// Dual Storage Strategy:
	// 1. Sensitive / Private assets (payment_proof) -> Supabase Storage (erp-internal-vault) with signed URLs.
	// 2. Public assets (chat_image, product_photo, community_post, avatar, etc.) -> Cloudflare R2 with permanent CDN URLs.
	const isChat = purpose === 'chat_image';
	const isPayment = purpose === 'payment_proof';
	const isSensitive = isPayment;
	const targetBucket = isSensitive ? 'erp-internal-vault' : (env.r2?.bucket || 'pwa-media-public');
	const visibility = isSensitive ? 'private' : 'public';

	let storagePath: string;
	let thumbStoragePath: string | undefined;

	if (isChat) {
		const threadFolder = (options.targetId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
		storagePath = `uploads/chat_attachment/${threadFolder}/${sanitizedUserId}/${uniqueToken}_${Date.now()}.${ext}`;
		thumbStoragePath = compressionResult.thumbnail
			? `uploads/chat_attachment/${threadFolder}/${sanitizedUserId}/thumb_${uniqueToken}_${Date.now()}.${ext}`
			: undefined;
	} else {
		storagePath = `uploads/${safeFeature}/${sanitizedUserId}/${uniqueToken}_${Date.now()}.${ext}`;
		thumbStoragePath = compressionResult.thumbnail
			? `uploads/${safeFeature}/${sanitizedUserId}/thumb_${uniqueToken}_${Date.now()}.${ext}`
			: undefined;
	}

	try {
		let primaryUrl = '';
		let thumbnailUrl = '';

		if (isSensitive) {
			if (!env.supabase) {
				throw new UploadPipelineError('Supabase client is required for private vault asset uploads.', 'STORAGE_ERROR', false);
			}

			const headerKey = env.zeroTrustHeader || 'X-Upload-Pipeline-Verified';
			const { error: uploadError } = await env.supabase.storage
				.from(targetBucket)
				.upload(storagePath, primaryArtifact.blob, {
					contentType: primaryArtifact.mimeType,
					cacheControl: '3600',
					upsert: false,
					headers: { [headerKey]: 'verified' }
				});

			if (uploadError) {
				throw new UploadPipelineError(
					'Gagal mengunggah bukti pembayaran: ' + sanitizeErrorMessage(uploadError.message),
					'STORAGE_ERROR',
					true
				);
			}

			onProgress?.(80, 'uploading');

			if (thumbStoragePath && compressionResult.thumbnail) {
				await env.supabase.storage
					.from(targetBucket)
					.upload(thumbStoragePath, compressionResult.thumbnail.blob, {
						contentType: compressionResult.thumbnail.mimeType,
						cacheControl: '3600',
						upsert: false,
						headers: { [headerKey]: 'verified' }
					});
			}

			onProgress?.(95, 'finalizing');

			const { data: signedData } = await env.supabase.storage
				.from(targetBucket)
				.createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days active token
			primaryUrl = signedData?.signedUrl || '';

			if (thumbStoragePath) {
				const { data: thumbSignedData } = await env.supabase.storage
					.from(targetBucket)
					.createSignedUrl(thumbStoragePath, 60 * 60 * 24 * 7);
				thumbnailUrl = thumbSignedData?.signedUrl || primaryUrl;
			} else {
				thumbnailUrl = primaryUrl;
			}
		} else {
			if (!env.r2) {
				throw new UploadPipelineError('Cloudflare R2 configuration is missing for public assets.', 'STORAGE_ERROR', false);
			}

			const r2Res = await uploadToR2(storagePath, primaryArtifact.blob, primaryArtifact.mimeType, env.r2);
			primaryUrl = r2Res.publicUrl;

			onProgress?.(80, 'uploading');

			if (thumbStoragePath && compressionResult.thumbnail) {
				const r2ThumbRes = await uploadToR2(
					thumbStoragePath,
					compressionResult.thumbnail.blob,
					compressionResult.thumbnail.mimeType,
					env.r2
				);
				thumbnailUrl = r2ThumbRes.publicUrl;
			} else {
				thumbnailUrl = primaryUrl;
			}

			onProgress?.(95, 'finalizing');
		}

		// Audit Log into media_assets registry (Non-blocking)
		if (env.supabase?.from) {
			try {
				await env.supabase.from('media_assets').insert({
					bucket_id: targetBucket,
					storage_path: storagePath,
					file_name: file.name,
					mime_type: primaryArtifact.mimeType,
					byte_size: primaryArtifact.size,
					visibility,
					entity_type: purpose,
					entity_id: targetId || null,
					uploaded_by: activeUserId
				});
			} catch (auditErr) {
				console.warn('Audit media_assets notice:', auditErr);
			}
		}

		onProgress?.(100, 'finalizing');

		return {
			success: true,
			url: primaryUrl,
			thumbnailUrl,
			width: primaryArtifact.width,
			height: primaryArtifact.height,
			size: primaryArtifact.size,
			originalSize: compressionResult.originalSize,
			savedPercentage: compressionResult.savedPercentage,
			mimeType: primaryArtifact.mimeType,
			tierUsed: compressionResult.tierUsed,
			purposeUsed: purpose,
			storagePath,
			thumbnailStoragePath: thumbStoragePath,
			qualityReached: compressionResult.qualityReached,
			warning: compressionResult.warning
		};
	} catch (err: any) {
		if (err instanceof UploadPipelineError) throw err;
		throw new UploadPipelineError(
			sanitizeErrorMessage(err?.message || 'Terjadi kesalahan jaringan saat mengunggah foto.'),
			'NETWORK_ERROR',
			true
		);
	}
}

/**
 * Factory to create an upload pipeline instance bound to specific environment configuration.
 */
export function createUploadPipeline(env: UploadPipelineEnvironment) {
	return {
		processAndUploadImage: (options: UploadPipelineOptions) => processAndUploadImage(options, env),
		getSignedAssetUrl: async (bucket: string, path: string, expiresInSeconds: number = 3600): Promise<string> => {
			if (!path) return '';
			if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
				return path;
			}
			if (!env.supabase) return '';
			try {
				const { data, error } = await env.supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
				if (error || !data?.signedUrl) return '';
				return data.signedUrl;
			} catch (e) {
				console.warn('Failed to generate signed url:', e);
				return '';
			}
		}
	};
}
