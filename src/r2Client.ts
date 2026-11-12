/**
 * Cloudflare R2 Client via AWS S3 Signature Version 4 (SigV4)
 * Pure standard Web Crypto implementation: zero external npm dependencies.
 * Runs seamlessly in browser, PWA, Service Worker, Cloudflare Pages, and Node.js.
 */

export interface R2ClientConfig {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	publicDomain: string;
	endpoint?: string;
}

export interface R2UploadResult {
	success: boolean;
	publicUrl: string;
	storagePath: string;
	etag?: string;
}

// Convert ArrayBuffer to hex string
function toHex(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

// SHA-256 hash using SubtleCrypto
async function sha256(data: Uint8Array | string): Promise<string> {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return toHex(hash);
}

// HMAC-SHA256 signature
async function hmacSha256(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key as BufferSource,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

// Generate AWS SigV4 Signing Key
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
	const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	const kSigning = await hmacSha256(kService, 'aws4_request');
	return kSigning;
}

/**
 * Uploads a file/blob to Cloudflare R2 bucket with AWS SigV4 authorization.
 */
export async function uploadToR2(
	storagePath: string,
	body: Blob | Uint8Array,
	mimeType: string,
	config: R2ClientConfig
): Promise<R2UploadResult> {
	if (!config || !config.accessKeyId || !config.secretAccessKey) {
		throw new Error('Cloudflare R2 credentials (accessKeyId, secretAccessKey) are not configured.');
	}

	const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
	const now = new Date();
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // e.g. 20261112T120000Z
	const dateStamp = amzDate.slice(0, 8); // e.g. 20261112

	const region = 'auto';
	const service = 's3';
	const host = `${config.accountId}.r2.cloudflarestorage.com`;
	const canonicalUri = `/${config.bucket}/${cleanPath}`;

	// Read payload bytes to calculate payload SHA-256
	const payloadBytes = body instanceof Uint8Array ? body : new Uint8Array(await body.arrayBuffer());
	const payloadHash = await sha256(payloadBytes);

	// Canonical headers (must be sorted alphabetically, lowercase)
	const canonicalHeaders =
		`content-type:${mimeType}\n` +
		`host:${host}\n` +
		`x-amz-content-sha256:${payloadHash}\n` +
		`x-amz-date:${amzDate}\n`;

	const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

	// Canonical Request
	const canonicalRequest =
		'PUT\n' +
		canonicalUri + '\n' +
		'' + '\n' + // Query string (empty)
		canonicalHeaders + '\n' +
		signedHeaders + '\n' +
		payloadHash;

	// String to Sign
	const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
	const hashedCanonicalRequest = await sha256(canonicalRequest);
	const stringToSign =
		'AWS4-HMAC-SHA256\n' +
		amzDate + '\n' +
		credentialScope + '\n' +
		hashedCanonicalRequest;

	// Calculate signature
	const signingKey = await getSignatureKey(config.secretAccessKey, dateStamp, region, service);
	const signatureBytes = await hmacSha256(signingKey, stringToSign);
	const signature = toHex(signatureBytes);

	const authorizationHeader =
		`AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
		`SignedHeaders=${signedHeaders}, ` +
		`Signature=${signature}`;

	const uploadUrl = `https://${host}${canonicalUri}`;

	const response = await fetch(uploadUrl, {
		method: 'PUT',
		headers: {
			'Host': host,
			'Content-Type': mimeType,
			'x-amz-content-sha256': payloadHash,
			'x-amz-date': amzDate,
			'Authorization': authorizationHeader
		},
		body: payloadBytes as unknown as BodyInit
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('[R2 Upload Error]', response.status, errorText);
		throw new Error(`Cloudflare R2 upload failed [${response.status}]: ${errorText.slice(0, 150)}`);
	}

	const basePublicUrl = config.publicDomain.endsWith('/') ? config.publicDomain.slice(0, -1) : config.publicDomain;
	const publicUrl = `${basePublicUrl}/${cleanPath}`;

	return {
		success: true,
		publicUrl,
		storagePath: cleanPath,
		etag: response.headers.get('etag') || undefined
	};
}
