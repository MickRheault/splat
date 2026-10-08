/**
 * Centralized Application Configuration
 * Driven by VITE_API_BASE_URL environment variable with production fallback.
 */
const envApiUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL: string = envApiUrl || 'https://splat-bills.vercel.app';
export const UPDATE_MANIFEST_URL: string = `${API_BASE_URL}/updates/update.json`;
