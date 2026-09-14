import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface StoredSettings {
  assemblyAiKey?: {
    value: string;
    encrypted: boolean;
  };
}

export class SettingsStore {
  private get filePath() {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  private async read(): Promise<StoredSettings> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as StoredSettings;
    } catch {
      return {};
    }
  }

  async getAssemblyAiKey() {
    const settings = await this.read();
    const stored = settings.assemblyAiKey;
    if (!stored?.value) return '';
    if (!stored.encrypted) return stored.value;
    if (!safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(stored.value, 'base64'));
    } catch {
      return '';
    }
  }

  async setAssemblyAiKey(apiKey: string) {
    const settings = await this.read();
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      delete settings.assemblyAiKey;
    } else if (safeStorage.isEncryptionAvailable()) {
      settings.assemblyAiKey = {
        value: safeStorage.encryptString(cleanKey).toString('base64'),
        encrypted: true,
      };
    } else {
      settings.assemblyAiKey = { value: cleanKey, encrypted: false };
    }

    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
