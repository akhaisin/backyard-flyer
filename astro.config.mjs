import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://akhaisin.github.io',
  base: '/backyard-flyer',
  integrations: [react(), mdx()],
});
