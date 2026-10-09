/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Режим распознавания лиц: `mock` (по умолчанию) или `service`. См. .env.example */
  readonly VITE_FACE_API?: 'mock' | 'service'
}
