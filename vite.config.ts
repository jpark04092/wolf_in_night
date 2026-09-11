import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {defineConfig} from 'vite';
import { viteWebdavPlugin } from './src/server/webdavMiddleware';

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = pkg.version || '1.1.0';

// Resolve Git Commit Hash
let commitHash = process.env.VITE_GIT_COMMIT_HASH || process.env.GITHUB_SHA || '';
if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    commitHash = 'live';
  }
} else if (commitHash.length > 7) {
  commitHash = commitHash.substring(0, 7);
}

// Generate KST build time
const now = new Date();
const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const buildTime = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')} ${String(kstDate.getUTCHours()).padStart(2, '0')}:${String(kstDate.getUTCMinutes()).padStart(2, '0')} KST`;

// Custom plugin to write version.json and copy management scripts into dist
function versionOutputPlugin() {
  return {
    name: 'generate-version-json',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distDir)) {
        const versionData = {
          version: `v${appVersion}`,
          commit: commitHash,
          buildTime: buildTime,
        };
        fs.writeFileSync(
          path.join(distDir, 'version.json'),
          JSON.stringify(versionData, null, 2),
          'utf-8'
        );

        // Copy install.sh and update.sh into dist
        for (const script of ['install.sh', 'update.sh']) {
          const srcPath = path.resolve(__dirname, script);
          const destPath = path.join(distDir, script);
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            try {
              fs.chmodSync(destPath, 0o755);
            } catch {
              // ignore on non-posix
            }
          }
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(`v${appVersion}`),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __COMMIT_HASH__: JSON.stringify(commitHash),
    },
    plugins: [react(), tailwindcss(), versionOutputPlugin(), viteWebdavPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
