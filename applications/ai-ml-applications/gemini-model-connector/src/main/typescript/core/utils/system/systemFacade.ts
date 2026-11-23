import { osUtils, type IOperatingSystem } from "@/core/utils/system/os.js";
import { fsUtils, type IFileSystem } from "@/core/utils/system/fs.js";
import {
  processUtils,
  type IProcessUtils,
} from "@/core/utils/system/process.js";
import { cryptoUtils, type ICryptoUtils } from "@/core/utils/system/crypto.js";

/**
 * Enterprise System Facade Abstraction.
 * Conforms to Directive #1 & #2: Move OS, FS, Process implementation inside core/utils.
 */
export class SystemFacade {
  public readonly os: IOperatingSystem;
  public readonly fs: IFileSystem;
  public readonly process: IProcessUtils;
  public readonly crypto: ICryptoUtils;

  constructor(
    os: IOperatingSystem = osUtils,
    fs: IFileSystem = fsUtils,
    process: IProcessUtils = processUtils,
    crypto: ICryptoUtils = cryptoUtils,
  ) {
    this.os = os;
    this.fs = fs;
    this.process = process;
    this.crypto = crypto;
  }
}

export const systemFacade = new SystemFacade();
export const sysOs = systemFacade.os;
export const sysFs = systemFacade.fs;
export const sysProcess = systemFacade.process;
export const sysCrypto = systemFacade.crypto;
