import { pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const target = path.resolve(process.cwd(), "dist", rel);
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (specifier === "@model-box/model-connector-core") {
    const target = path.resolve(process.cwd(), "../model-connector-core/dist/index.js");
    return nextResolve(pathToFileURL(target).href, context);
  }
  if (specifier.startsWith("@model-box/model-connector-core/")) {
    const rel = specifier.replace("@model-box/model-connector-core/", "");
    const target = path.resolve(process.cwd(), "../model-connector-core/dist", rel);
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}

