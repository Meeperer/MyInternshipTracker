import autoAdapter from '@sveltejs/adapter-auto';
import vercelAdapter from '@sveltejs/adapter-vercel';

const useLocalAdapter = process.platform === 'win32' && !process.env.VERCEL;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // The Vercel adapter relies on symlinks that fail during local Windows builds.
    // Keep Vercel output for deployed builds while allowing local verification to pass.
    adapter: useLocalAdapter ? autoAdapter() : vercelAdapter({}),
    alias: {
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $utils: 'src/lib/utils'
    }
  }
};

export default config;
