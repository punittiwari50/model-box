/**
 * Enterprise File Utilities adhering to STD-COD-003.
 * Centralizes file reading, conversion, size formatting, and downloading operations.
 */

export class FileUtils {
  /**
   * Reads a File or Blob as an ArrayBuffer.
   */
  public static async readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return blob.arrayBuffer();
  }

  /**
   * Reads a File or Blob as a UTF-8 text string.
   */
  public static async readAsText(blob: Blob): Promise<string> {
    return blob.text();
  }

  /**
   * Reads a File or Blob as a Data URL (base64 encoded).
   */
  public static async readAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Formats byte counts into human-readable strings (KB, MB, GB).
   */
  public static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  /**
   * Triggers a browser download for a Blob or text content.
   */
  public static triggerDownload(content: Blob | string, filename: string, mimeType: string = 'text/plain'): void {
    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Extracts clean filename from a path or URL string.
   */
  public static getFilename(pathOrUrl: string): string {
    const cleaned = pathOrUrl.split('?')[0].split('#')[0];
    return cleaned.substring(cleaned.lastIndexOf('/') + 1);
  }

  /**
   * Extracts file extension without dot.
   */
  public static getFileExtension(filename: string): string {
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex !== -1 ? filename.substring(dotIndex + 1).toLowerCase() : '';
  }
}
