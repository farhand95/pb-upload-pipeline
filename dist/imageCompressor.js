/**
 * Unified Image Compression Engine
 * 5-Tier Reusable Client-Side Compression Utility with Purpose Profiles,
 * Dual Thumbnail Generation, Quality Floor Safeguards, and Decompression-Bomb Protection.
 */
import { COMPRESSION_TIERS, PURPOSE_PROFILES, SECURITY_INVARIANTS } from './uploadConfig';
import { validateImageMagicBytes } from './imageValidator';
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
/**
 * Universal Compression Pipeline:
 * Validates, strips metadata, proportionally downsamples, generates dual outputs,
 * and enforces quality floors without direct upload bypass.
 */
export async function compressImagePipeline(rawFile, options = {}) {
    const startTime = performance.now();
    // 1. Resolve Purpose & Tier (Default: Tier 3 Medium)
    const purpose = options.purpose || 'general';
    const profile = PURPOSE_PROFILES[purpose] || PURPOSE_PROFILES.general;
    const tier = options.tier || profile.defaultTier || 'medium';
    const tierSettings = COMPRESSION_TIERS[tier] || COMPRESSION_TIERS.medium;
    // 2. Pre-compression Raw Input Limit Check (Preflight)
    if (rawFile.size > profile.rawInputLimitBytes) {
        throw new Error(`Ukuran file (${formatFileSize(rawFile.size)}) melebihi batas maksimal untuk ${purpose} (${formatFileSize(profile.rawInputLimitBytes)}). Harap pilih gambar yang lebih hemat.`);
    }
    if (rawFile.size === 0) {
        throw new Error('Berkas gambar kosong (0 byte). Harap pilih berkas gambar yang valid.');
    }
    // 3. Binary Magic-Byte Inspection
    const fileHeader = await rawFile.slice(0, 32).arrayBuffer();
    const magicResult = validateImageMagicBytes(fileHeader);
    if (!magicResult.valid) {
        throw new Error(`Validasi keamanan gambar gagal: ${magicResult.reason}`);
    }
    // 4. Decode & Decompression-Bomb Guard
    if (options.signal?.aborted) {
        throw new DOMException('Proses kompresi gambar dibatalkan pengguna.', 'AbortError');
    }
    const objectUrl = URL.createObjectURL(rawFile);
    const img = new Image();
    try {
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Gagal mendecode data raster gambar. Berkas mungkin rusak.'));
            img.src = objectUrl;
        });
    }
    finally {
        URL.revokeObjectURL(objectUrl);
    }
    const rawWidth = img.naturalWidth || img.width;
    const rawHeight = img.naturalHeight || img.height;
    const totalPixels = rawWidth * rawHeight;
    if (totalPixels > SECURITY_INVARIANTS.MAX_TOTAL_PIXELS ||
        rawWidth > SECURITY_INVARIANTS.MAX_DIMENSION ||
        rawHeight > SECURITY_INVARIANTS.MAX_DIMENSION) {
        throw new Error(`Dimensi gambar terlalu besar (${rawWidth}x${rawHeight} px). Batas keamanan maksimal adalah ${SECURITY_INVARIANTS.MAX_DIMENSION}px atau 48 Megapiksel.`);
    }
    // 5. Avoid Repeated Recompression on Already-Optimized WebP
    const primaryTargetMaxDim = options.customMaxDimension || tierSettings.maxDimension || tierSettings.maxWidth;
    const isAlreadyOptimized = magicResult.detectedFormat === 'image/webp' &&
        rawFile.size <= (options.customCeilingBytes || tierSettings.outputCeilingBytes) &&
        Math.max(rawWidth, rawHeight) <= primaryTargetMaxDim;
    // 6. Primary Image Compression
    const targetCeiling = options.customCeilingBytes || profile.outputCeilingBytes || tierSettings.outputCeilingBytes;
    let primaryArtifact;
    if (isAlreadyOptimized && tier !== 'maximum') {
        primaryArtifact = {
            file: rawFile,
            blob: rawFile,
            size: rawFile.size,
            width: rawWidth,
            height: rawHeight,
            previewUrl: URL.createObjectURL(rawFile),
            mimeType: 'image/webp',
            ceilingMet: true,
            qualityReached: tierSettings.initialQuality
        };
    }
    else {
        primaryArtifact = await renderCanvasArtifact(img, {
            maxDimension: primaryTargetMaxDim,
            maxWidth: options.customMaxWidth || primaryTargetMaxDim,
            maxHeight: options.customMaxHeight || primaryTargetMaxDim,
            initialQuality: options.customQuality || tierSettings.initialQuality,
            qualityFloor: tierSettings.qualityFloor,
            outputCeilingBytes: targetCeiling,
            format: tierSettings.preferredFormat,
            fileName: rawFile.name || 'compressed_image'
        });
    }
    // 7. Thumbnail Generation (generated separately with dedicated thumbnail dimensions)
    let thumbnailArtifact;
    const shouldGenThumb = options.generateThumbnail ??
        (purpose === 'chat_image' || purpose === 'payment_proof' || purpose === 'avatar');
    if (shouldGenThumb) {
        const thumbMaxDim = Math.max(profile.thumbnailWidth, profile.thumbnailHeight);
        thumbnailArtifact = await renderCanvasArtifact(img, {
            maxDimension: thumbMaxDim,
            maxWidth: profile.thumbnailWidth,
            maxHeight: profile.thumbnailHeight,
            initialQuality: profile.thumbnailQuality,
            qualityFloor: 0.35,
            outputCeilingBytes: profile.thumbnailCeilingBytes,
            format: 'image/webp',
            fileName: `thumb_${rawFile.name || 'image'}`
        });
    }
    const totalSavedBytes = Math.max(0, rawFile.size - primaryArtifact.size);
    const savedPercentage = Math.round((totalSavedBytes / (rawFile.size || 1)) * 100);
    const ceilingMet = primaryArtifact.ceilingMet ?? (primaryArtifact.size <= targetCeiling);
    return {
        primary: primaryArtifact,
        thumbnail: thumbnailArtifact,
        tierUsed: tier,
        purposeUsed: purpose,
        originalSize: rawFile.size,
        totalSavedBytes,
        savedPercentage,
        ceilingMet,
        qualityReached: primaryArtifact.qualityReached ?? tierSettings.initialQuality,
        warning: primaryArtifact.warning,
        durationMs: Math.round(performance.now() - startTime)
    };
}
/**
 * Internal canvas drawing, metadata stripping, longest-edge downsampling,
 * and iterative step-down quality engine.
 * Guarantees aspect ratio preservation with zero upscaling.
 */
async function renderCanvasArtifact(img, opts) {
    let { width, height } = img;
    const longestEdge = Math.max(width, height);
    const targetMaxDim = opts.maxDimension || Math.max(opts.maxWidth, opts.maxHeight);
    // Proportional downsampling capping the longest edge (no upscaling)
    if (longestEdge > targetMaxDim) {
        const scale = targetMaxDim / longestEdge;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Gagal menginisialisasi canvas context.');
    }
    // High-fidelity rendering with EXIF stripping
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    // Iterative step-down quality export until ceiling is met or quality floor is reached
    let currentQuality = opts.initialQuality;
    let bestBlob = null;
    const stepDown = 0.06;
    let ceilingMet = false;
    while (currentQuality >= opts.qualityFloor) {
        const blob = await exportBlobWithFallback(canvas, opts.format, currentQuality);
        bestBlob = blob;
        if (blob.size <= opts.outputCeilingBytes) {
            ceilingMet = true;
            break;
        }
        if (currentQuality - stepDown < opts.qualityFloor) {
            // Stop at configured quality floor to prevent unacceptable visual degradation
            break;
        }
        currentQuality = parseFloat((currentQuality - stepDown).toFixed(2));
    }
    if (!bestBlob) {
        throw new Error('Gagal mengekspor berkas gambar terkompresi.');
    }
    let warning;
    if (!ceilingMet) {
        warning = `Berkas gambar (${formatFileSize(bestBlob.size)}) belum dapat memenuhi target batas (${formatFileSize(opts.outputCeilingBytes)}) pada batas kualitas minimum (${Math.round(opts.qualityFloor * 100)}%). Kualitas visual dipertahankan untuk mencegah kerusakan gambar.`;
        console.warn(`[ImageCompressor] Ceiling report:`, warning);
    }
    const baseName = opts.fileName.substring(0, opts.fileName.lastIndexOf('.')) || opts.fileName;
    const ext = bestBlob.type === 'image/webp' ? 'webp' : 'jpg';
    const finalName = `${baseName}.${ext}`;
    const compressedFile = new File([bestBlob], finalName, {
        type: bestBlob.type,
        lastModified: Date.now()
    });
    return {
        file: compressedFile,
        blob: bestBlob,
        size: bestBlob.size,
        width,
        height,
        previewUrl: URL.createObjectURL(bestBlob),
        mimeType: bestBlob.type,
        qualityReached: currentQuality,
        ceilingMet,
        warning
    };
}
/**
 * Canvas toBlob wrapper with defensive JPEG fallback if WebP export is unsupported.
 */
function exportBlobWithFallback(canvas, preferredFormat, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                return resolve(blob);
            }
            // Fallback to JPEG if browser canvas fails on preferredFormat
            if (preferredFormat !== 'image/jpeg') {
                canvas.toBlob((jpegBlob) => {
                    if (jpegBlob)
                        resolve(jpegBlob);
                    else
                        reject(new Error('Gagal mengekspor canvas gambar.'));
                }, 'image/jpeg', quality);
            }
            else {
                reject(new Error('Gagal mengekspor canvas gambar.'));
            }
        }, preferredFormat, quality);
    });
}
// Backward-Compatibility Helpers for Existing Consumers
export async function compressImage(file, options = {}) {
    const res = await compressImagePipeline(file, {
        tier: 'medium',
        customMaxWidth: options.maxWidth,
        customMaxHeight: options.maxHeight,
        customQuality: options.quality
    });
    return {
        file: res.primary.file,
        blob: res.primary.blob,
        previewUrl: res.primary.previewUrl,
        compressedSize: res.primary.size,
        originalSize: res.originalSize,
        savedPercentage: res.savedPercentage,
        width: res.primary.width,
        height: res.primary.height
    };
}
export async function compressPaymentProof(file) {
    const res = await compressImagePipeline(file, { purpose: 'payment_proof' });
    return {
        file: res.primary.file,
        blob: res.primary.blob,
        previewUrl: res.primary.previewUrl,
        compressedSize: res.primary.size,
        originalSize: res.originalSize,
        savedPercentage: res.savedPercentage,
        width: res.primary.width,
        height: res.primary.height
    };
}
export async function compressCommunityImage(file) {
    const res = await compressImagePipeline(file, { purpose: 'community_post' });
    return {
        file: res.primary.file,
        blob: res.primary.blob,
        previewUrl: res.primary.previewUrl,
        compressedSize: res.primary.size,
        originalSize: res.originalSize,
        savedPercentage: res.savedPercentage,
        width: res.primary.width,
        height: res.primary.height
    };
}
//# sourceMappingURL=imageCompressor.js.map