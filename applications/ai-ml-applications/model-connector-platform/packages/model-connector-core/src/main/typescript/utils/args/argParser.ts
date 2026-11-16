import { processUtils } from "@/utils/process/processUtils.js";

export interface ParsedArgs {
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly positional: readonly string[];
}

/**
 * Enterprise Application Argument Parser.
 * Conforms to Directive #2: Clean process.argv parsing and governance.
 */
export class ArgParser {
  public static parse(argv: readonly string[] = processUtils.argv.slice(2)): ParsedArgs {
    const flags: Record<string, string | boolean> = {};
    const positional: string[] = [];

    for (const arg of argv) {
      if (arg.startsWith("--")) {
        const sliced = arg.slice(2);
        const eqIdx = sliced.indexOf("=");
        if (eqIdx !== -1) {
          flags[sliced.substring(0, eqIdx)] = sliced.substring(eqIdx + 1);
        } else {
          flags[sliced] = true;
        }
      } else if (arg.startsWith("-") && arg.length > 1) {
        flags[arg.slice(1)] = true;
      } else {
        positional.push(arg);
      }
    }

    return Object.freeze({
      flags: Object.freeze(flags),
      positional: Object.freeze(positional),
    });
  }
}
