// src/types.ts
export type VibeCheckRequest = {
  action: 'CHECK_VIBE';
  text: string;
};

export type VibeCheckResponse = {
  isBadVibe: boolean;
  reason?: string;
  error?: string;
};