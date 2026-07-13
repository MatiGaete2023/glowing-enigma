// Empaqueta dist/ en deploy/gymtracker-v11-dist.zip para subir a Netlify Drop
// (https://app.netlify.com/drop) desde cualquier dispositivo, sin CI/CD conectado a git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'dist');
const deployDir = resolve(root, 'deploy');
const zipPath = resolve(deployDir, 'gymtracker-v11-dist.zip');

if (!existsSync(distDir)) {
  console.error('No existe dist/. Corre "npm run build" antes de "npm run pack".');
  process.exit(1);
}

mkdirSync(deployDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

execFileSync('zip', ['-r', zipPath, '.'], { cwd: distDir, stdio: 'inherit' });

console.log(`\n✓ Listo: ${zipPath}`);
console.log('  Súbelo en https://app.netlify.com/drop (ver DEPLOY_NETLIFY_DROP.md)');
