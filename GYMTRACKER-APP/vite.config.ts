import { defineConfig } from 'vite';

export default defineConfig({
  base: '/', // Netlify Drop sirve el sitio en la raíz del subdominio
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
  },
});
