import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mickrheault.splat',
  appName: 'Splat',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false
    }
  }
};

export default config;
