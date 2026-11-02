export class DesktopUiService {
  public static copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    return Promise.resolve(false);
  }

  public static formatTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
