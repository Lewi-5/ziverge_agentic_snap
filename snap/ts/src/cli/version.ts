import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  readonly version: string;
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)["version"] === "string";
}

function readPackageVersion(): string {
  const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (!isPackageManifest(parsed)) {
    throw new Error("package.json is missing a version field");
  }
  return parsed.version;
}

export const SNAP_VERSION: string = readPackageVersion();
