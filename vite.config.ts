import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const base = repository && repository !== `${owner}.github.io` ? `/${repository}/` : '/';

export default defineConfig({
  base,
  plugins: [svelte()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
