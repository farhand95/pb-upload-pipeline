/**
 * Image Security & Binary Magic-Bytes Validator
 * Inspects raw binary headers to detect actual image file formats,
 * rejecting spoofed extensions, HTML/SVG payloads, executables, and malformed files.
 */
export interface ValidationSuccess {
    valid: true;
    detectedFormat: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
    extension: string;
}
export interface ValidationFailure {
    valid: false;
    reason: string;
    errorCode: 'INVALID_MAGIC_BYTES' | 'UNSUPPORTED_FORMAT' | 'CORRUPTED_FILE' | 'EXECUTABLE_OR_SCRIPT_DETECTED';
}
export type FileValidationResult = ValidationSuccess | ValidationFailure;
/**
 * Sniffs the first 32 bytes of an ArrayBuffer or Uint8Array to identify valid raster formats.
 */
export declare function validateImageMagicBytes(buffer: ArrayBuffer | Uint8Array): FileValidationResult;
//# sourceMappingURL=imageValidator.d.ts.map