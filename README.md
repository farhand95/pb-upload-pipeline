# @pb/upload-pipeline

Framework-agnostic, zero-dependency client image compression engine and dual-storage router (Cloudflare R2 + Supabase Storage Vault) for PB Furniture PWA and Kalindra OS ecosystem.

## Features

- **5-Tier Quality Compression:** Minimal (1440px), Light (1080px), Medium (720px - Default), Strong (384px), Maximum (128px - Avatars).
- **Security Invariants:** Binary magic-byte inspection (detects executable/script injections), decompression-bomb limits (48MP ceiling).
- **Dual Storage Architecture:**
  - **Sensitive / Private Files (`payment_proof`):** Uploads to Supabase Storage vault (`erp-internal-vault`) with time-limited signed URLs.
  - **Public Files (`chat_image`, `avatar`, `product_photo`, etc.):** Uploads to Cloudflare R2 bucket with permanent public CDN URLs.
- **Zero NPM Dependencies:** Implements AWS SigV4 via native Web Crypto (`crypto.subtle`) for minimal bundle footprint.

## Installation

```bash
npm install github:farhand95/pb-upload-pipeline#v1.0.0
```

## Quick Start

```ts
import { createUploadPipeline } from '@pb/upload-pipeline';
import { supabase } from '$lib/supabase/supabaseClient';

const uploadPipeline = createUploadPipeline({
  supabase,
  r2: {
    accountId: import.meta.env.VITE_R2_ACCOUNT_ID,
    accessKeyId: import.meta.env.VITE_R2_PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_PUBLIC_SECRET_ACCESS_KEY,
    bucket: 'pwa-media-public',
    publicDomain: 'https://pub-56fa9ebbfa404764a598aca99b24033d.r2.dev'
  },
  activeUserId: user.id
});

// Upload an image:
const result = await uploadPipeline.processAndUploadImage({
  file,
  purpose: 'chat_image',
  tier: 'medium',
  onProgress: (progress, stage) => {
    console.log(`[Upload] ${stage}: ${progress}%`);
  }
});

console.log(result.url, result.thumbnailUrl);
```

## License

Private / Kalindra OS
