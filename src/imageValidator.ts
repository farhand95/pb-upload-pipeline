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
export function validateImageMagicBytes(buffer: ArrayBuffer | Uint8Array): FileValidationResult {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

	if (bytes.length < 12) {
		return {
			valid: false,
			reason: 'Ukuran file tidak mencukupi untuk berkas gambar yang valid.',
			errorCode: 'CORRUPTED_FILE'
		};
	}

	// 1. Detect Scripts, Executables & Web Injections
	// MZ header (Windows EXE / DLL)
	if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
		return {
			valid: false,
			reason: 'Berkas eksekusi biner terlarang terdeteksi.',
			errorCode: 'EXECUTABLE_OR_SCRIPT_DETECTED'
		};
	}
	// ELF header (Linux binary)
	if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
		return {
			valid: false,
			reason: 'Berkas eksekusi biner terlarang terdeteksi.',
			errorCode: 'EXECUTABLE_OR_SCRIPT_DETECTED'
		};
	}
	// SVG / XML / HTML / Script injection check
	const headerString = String.fromCharCode(...bytes.slice(0, 32)).toLowerCase();
	if (
		headerString.includes('<svg') ||
		headerString.includes('<?xml') ||
		headerString.includes('<html') ||
		headerString.includes('<script') ||
		headerString.startsWith('#!')
	) {
		return {
			valid: false,
			reason: 'Format vektor berbasis teks (SVG/HTML/Script) tidak diizinkan demi keamanan sistem.',
			errorCode: 'UNSUPPORTED_FORMAT'
		};
	}

	// 2. JPEG check: FF D8 FF
	if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
		return {
			valid: true,
			detectedFormat: 'image/jpeg',
			extension: 'jpg'
		};
	}

	// 3. PNG check: 89 50 4E 47 0D 0A 1A 0A
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4E &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0D &&
		bytes[5] === 0x0A &&
		bytes[6] === 0x1A &&
		bytes[7] === 0x0A
	) {
		return {
			valid: true,
			detectedFormat: 'image/png',
			extension: 'png'
		};
	}

	// 4. WebP check: RIFF .... WEBP
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return {
			valid: true,
			detectedFormat: 'image/webp',
			extension: 'webp'
		};
	}

	// 5. AVIF / HEIF / ISO Base Media File Format: ftyp avif / avis
	if (
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70
	) {
		const ftypBrand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
		if (ftypBrand === 'avif' || ftypBrand === 'avis') {
			return {
				valid: true,
				detectedFormat: 'image/avif',
				extension: 'avif'
			};
		}
	}

	return {
		valid: false,
		reason: 'Format berkas tidak dikenali. Format yang didukung: JPG, PNG, WebP, AVIF.',
		errorCode: 'INVALID_MAGIC_BYTES'
	};
}
