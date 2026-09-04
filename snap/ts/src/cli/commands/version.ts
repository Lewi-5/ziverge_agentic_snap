import { ok } from "../../domain/result.js";
import { SNAP_VERSION } from "../version.js";
import type { Command } from "./command.js";

export const versionCommand: Command = () => Promise.resolve(ok({ kind: "version-info", version: SNAP_VERSION }));
