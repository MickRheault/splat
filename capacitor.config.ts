import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mickrheault.splat',
  appName: 'Splat',
  webDir: 'dist',
  backgroundColor: '#0c0a09',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false
    }
  }
};

export default config;
