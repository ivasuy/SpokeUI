import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const macIcon = resolve(process.cwd(), 'assets/SpokeUI.icns');
const windowsIcon = resolve(process.cwd(), 'assets/SpokeUI.ico');
const linuxIcon = resolve(process.cwd(), 'assets/icon.png');
const packageIcon = process.platform === 'darwin' ? macIcon : process.platform === 'win32' ? windowsIcon : linuxIcon;
const appleSigningIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const appleId = process.env.APPLE_ID?.trim();
const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
const hasNotarizationCredentials = Boolean(appleId && appleIdPassword && appleTeamId);

if (process.platform === 'darwin') {
  if ((appleId || appleIdPassword || appleTeamId) && (!hasNotarizationCredentials || !appleSigningIdentity)) {
    throw new Error('Notarization requires APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID.');
  }
  if (process.env.REQUIRE_MAC_NOTARIZATION === 'true' && (!appleSigningIdentity || !hasNotarizationCredentials)) {
    throw new Error('Public macOS releases must be Developer ID signed and notarized. Configure the Apple release secrets described in README.md.');
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'SpokeUI',
    executableName: 'SpokeUI',
    appBundleId: 'dev.spokeui.desktop',
    appCategoryType: 'public.app-category.developer-tools',
    icon: packageIcon,
    osxSign: appleSigningIdentity ? { identity: appleSigningIdentity } : undefined,
    osxNotarize: appleSigningIdentity && appleId && appleIdPassword && appleTeamId
      ? { appleId, appleIdPassword, teamId: appleTeamId }
      : undefined,
    extraResource: ['templates'],
    extendInfo: {
      NSMicrophoneUsageDescription: 'SpokeUI uses your microphone while you hold the speak button to transcribe edit requests.',
    },
  },
  makers: [
    new MakerDMG({ format: 'ULFO', icon: macIcon }, ['darwin']),
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
    new MakerSquirrel({
      name: 'spokeui',
      authors: 'SpokeUI contributors',
      description: 'Shape local web interfaces through voice and direct interaction.',
      setupIcon: windowsIcon,
    }, ['win32']),
    new MakerDeb({
      options: {
        name: 'spokeui',
        productName: 'SpokeUI',
        genericName: 'Voice interface development workspace',
        description: 'Shape local web interfaces through voice and direct interaction.',
        productDescription: 'A local desktop workspace that connects a running web interface, spoken requests, and a local coding agent.',
        maintainer: 'SpokeUI contributors',
        homepage: 'https://github.com/ivasuy/SpokeUI',
        section: 'devel',
        priority: 'optional',
        categories: ['Development'],
        icon: linuxIcon,
        bin: 'SpokeUI',
      },
    }, ['linux']),
  ],
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      if (packageResult.platform !== 'darwin') return;
      for (const outputPath of packageResult.outputPaths) {
        const appPath = join(outputPath, 'SpokeUI.app');
        if (!appleSigningIdentity) {
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
        } else if (hasNotarizationCredentials) {
          execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
          execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
          execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath], { stdio: 'inherit' });
        }
      }
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.mjs', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.mjs', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
    }),
  ],
};

export default config;
