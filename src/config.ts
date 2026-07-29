/**
 * Centralized Application Configuration & API Base URLs
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://splat-bills.vercel.app';
export const UPDATE_MANIFEST_URL = `${API_BASE_URL}/updates/update.json`;
