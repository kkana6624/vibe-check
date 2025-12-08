type VibeCheckRequest = {
  action: 'CHECK_VIBE';
  text: string;
};

type VibeCheckResponse = {
  isBadVibe: boolean;
  reason?: string;
  error?: string;
};