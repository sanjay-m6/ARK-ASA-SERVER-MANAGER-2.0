export class WindowsPlatformService {
  static getFirewallName(): string {
    return 'Windows Defender Firewall';
  }

  static isAutostartSupported(): boolean {
    return true;
  }
}
