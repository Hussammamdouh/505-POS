import { kvGet, kvSet } from './db';

export interface DeviceSettings {
  apiBaseUrl: string;
  deviceLetter: string;
  printerHost: string;
  printerPort: number;
}

const SETTINGS_KEY = 'device-settings';

export const DEFAULT_PRINTER_PORT = 9100;

export const loadSettings = () => kvGet<DeviceSettings>(SETTINGS_KEY);

export const saveSettings = (settings: DeviceSettings) => kvSet(SETTINGS_KEY, settings);

export function validateSettings(settings: DeviceSettings): string | null {
  if (!/^https?:\/\/\S+$/i.test(settings.apiBaseUrl.trim())) {
    return 'Server address must start with http:// or https://';
  }

  if (!/^[A-Z]$/.test(settings.deviceLetter)) {
    return 'Device letter must be a single letter A–Z, different on each iPad.';
  }

  if (settings.printerHost.trim() !== '' && !/^[\w.-]+$/.test(settings.printerHost.trim())) {
    return 'Printer address must be an IP like 192.168.1.50.';
  }

  if (!Number.isInteger(settings.printerPort) || settings.printerPort < 1 || settings.printerPort > 65535) {
    return 'Printer port must be a number between 1 and 65535 (usually 9100).';
  }

  return null;
}
