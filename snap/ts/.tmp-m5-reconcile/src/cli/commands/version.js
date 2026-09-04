import { ok } from "../../domain/result.js";
import { SNAP_VERSION } from "../version.js";
export const versionCommand = () => Promise.resolve(ok({ kind: "version-info", version: SNAP_VERSION }));
