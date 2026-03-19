export interface AISettings {
  provider: string;
  model: string;
  apiKey: string;
  sendContext: boolean;
}

export type SyncState = "idle" | "syncing" | "retrying" | "error" | "offline";

export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  display_name?: string;
  avatar_url?: string;
  storage_used?: number;
  storage_limit_mb?: number;
}
