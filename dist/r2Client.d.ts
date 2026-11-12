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
/**
 * Uploads a file/blob to Cloudflare R2 bucket with AWS SigV4 authorization.
 */
export declare function uploadToR2(storagePath: string, body: Blob | Uint8Array, mimeType: string, config: R2ClientConfig): Promise<R2UploadResult>;
//# sourceMappingURL=r2Client.d.ts.map