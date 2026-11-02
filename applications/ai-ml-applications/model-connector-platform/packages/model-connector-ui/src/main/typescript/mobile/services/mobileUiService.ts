export class MobileUiService {
  public static triggerHaptic(): void {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore vibration errors on unsupported browsers
      }
    }
  }

  public static scrollToBottom(element: HTMLElement | null): void {
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }
}
