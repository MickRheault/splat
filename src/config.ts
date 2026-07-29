/**
 * Centralized Application Configuration
 * Strictly driven by VITE_API_BASE_URL environment variable.
 */
const envApiUrl = import.meta.env.VITE_API_BASE_URL;

if (!envApiUrl && import.meta.env.MODE === 'production') {
  throw new Error('CRITICAL CONFIG ERROR: VITE_API_BASE_URL environment variable is not defined!');
}

export const API_BASE_URL: string = envApiUrl || '';
export const UPDATE_MANIFEST_URL: string = `${API_BASE_URL}/updates/update.json`;
