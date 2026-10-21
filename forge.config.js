const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { execFileSync } = require('child_process');

function releaseNotesFromCommit(version) {
  const subject = execFileSync('git', ['log', '-50', '--format=%s'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith(`(${version})`));

  if (!subject) {
    throw new Error(`No ${version} release commit found in the last 50 commits`);
  }

  const notes = subject
    .replace(/^\w+(\([^)]*\))?!?:\s*/, '')
    .replace(/\s*\(\d+\.\d+\.\d+\)$/, '');

  return notes.charAt(0).toUpperCase() + notes.slice(1);
}

module.exports = {
  packagerConfig: {
    asar: { unpack: '**/*.node' },
    icon: './build/icon',
    extraResource: ['./build/icon.ico'],
  },
  hooks: {
    packageAfterCopy: async (forgeConfig, buildPath) => {
      console.log('Building renderer...');
      const { build } = await import('vite');
      await build({
        configFile: path.join(__dirname, 'vite.renderer.config.mjs'),
        base: './',
        build: {
          outDir: path.join(buildPath, '.vite', 'renderer', 'main_window'),
          emptyOutDir: true,
        },
      });
      console.log('  ✓ Built renderer');

      console.log('Copying node_modules into build...');

      const { execSync } = require('child_process');
      const destNodeModules = path.join(buildPath, 'node_modules');
      fs.mkdirSync(destNodeModules, { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(buildPath, 'package.json'));
      fs.copyFileSync(path.join(__dirname, 'package-lock.json'), path.join(buildPath, 'package-lock.json'));
      execSync(`npm ci --prefix "${buildPath}" --omit=dev`, {
        cwd: __dirname,
        stdio: 'inherit'
      });
      console.log('  ✓ Copied production node_modules');
      const appUpdateYml = {
        provider: 'github',
        owner: 'rsparkle',
        repo: 'gacha-manager',
      };

      fs.writeFileSync(
        path.join(buildPath, '..', 'app-update.yml'),
        yaml.dump(appUpdateYml)
      );
      console.log('  ✓ Created app-update.yml');
    },
    postMake: async (forgeConfig, makeResults) => {
      const crypto = require('crypto');

      for (const result of makeResults) {
        if (result.platform === 'win32') {
          const exePath = result.artifacts.find(a => a.endsWith('.exe'));
          if (!exePath) continue;

          const fileBuffer = fs.readFileSync(exePath);
          const hash = crypto.createHash('sha512').update(fileBuffer).digest('base64');
          const size = fs.statSync(exePath).size;
          const fileName = path.basename(exePath).replace(/ /g, '.');
          const version = forgeConfig.packagerConfig?.appVersion || require('./package.json').version;

          const latestYml = {
            version,
            files: [{ url: fileName, sha512: hash, size }],
            path: fileName,
            sha512: hash,
            releaseDate: new Date().toISOString(),
            releaseNotes: releaseNotesFromCommit(version),
          };

          const outDir = path.dirname(exePath);
          const ymlPath = path.join(outDir, 'latest.yml');
          fs.writeFileSync(
            ymlPath,
            yaml.dump(latestYml)
          );
          console.log('✓ Generated latest.yml');
          result.artifacts.push(ymlPath)
        }
      }
    }
  },
  rebuildConfig: {
    force: true,
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'rsparkle',
          name: 'gacha-manager'
        },
        prerelease: false,
        draft: true,
      }
    }
  ],
  makers: [
    {
      name: '@electron-addons/electron-forge-maker-nsis'
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
