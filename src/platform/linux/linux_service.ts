export class LinuxPlatformService {
  static getFirewallName(): string {
    return 'Linux Firewall (UFW / Firewalld)';
  }

  static isAutostartSupported(): boolean {
    return true;
  }
}
