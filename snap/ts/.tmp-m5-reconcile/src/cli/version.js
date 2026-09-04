import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
function isPackageManifest(value) {
    return typeof value === "object" && value !== null && typeof value["version"] === "string";
}
function readPackageVersion() {
    const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (!isPackageManifest(parsed)) {
        throw new Error("package.json is missing a version field");
    }
    return parsed.version;
}
export const SNAP_VERSION = readPackageVersion();
