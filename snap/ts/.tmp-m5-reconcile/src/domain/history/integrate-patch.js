import { classifyContent } from "../content/classify.js";
import { joinTextTokens } from "../content/tokenize.js";
import { applyEdit } from "../edit/apply.js";
import { canonicalDiff } from "../edit/canonical-diff.js";
import { transformEdit } from "../ot/transform.js";
import { ok } from "../result.js";
import { constructFileTree } from "../tree/construct.js";
import { resolveNamespaceConflicts } from "../tree/namespace-conflicts.js";
import { pathContentsEqual, resolvePathConflict } from "../tree/path-conflicts.js";
import { applyAuthoredPatch } from "./authored-target.js";
import { sortWarningFacts } from "./warnings.js";
const textEncoder = new TextEncoder();
/** Integrates one patch against immutable exact-base B and current tree C. */
// eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types -- trees contain immutable byte arrays and Patch is deeply readonly in the domain.
export function integratePatch(base, current, patch) {
    const authoredTarget = applyAuthoredPatch(base, patch);
    if (!authoredTarget.ok)
        return authoredTarget;
    const presentTargets = new Map();
    const authoredDeletions = new Set();
    for (const change of patch.changes) {
        const content = authoredTarget.value.get(change.path);
        if (content === undefined)
            authoredDeletions.add(change.path);
        else
            presentTargets.set(change.path, content);
    }
    const namespace = resolveNamespaceConflicts(current, presentTargets, authoredDeletions);
    const removals = new Set(namespace.removals);
    const installations = new Map(namespace.installations);
    const warnings = [...namespace.warnings];
    for (const change of patch.changes) {
        if (namespace.settledIncomingPaths.has(change.path))
            continue;
        const baseContent = base.get(change.path);
        const currentContent = current.get(change.path);
        const authoredContent = authoredTarget.value.get(change.path);
        let resolved;
        if (pathContentsEqual(baseContent, currentContent)) {
            resolved = authoredContent;
        }
        else if (pathContentsEqual(currentContent, authoredContent)) {
            resolved = currentContent;
        }
        else if (change.type === "text" && baseContent !== undefined && currentContent !== undefined && authoredContent !== undefined) {
            const baseClassified = classifyContent(baseContent);
            const currentClassified = classifyContent(currentContent);
            const authoredClassified = classifyContent(authoredContent);
            if (baseClassified.kind === "text" && currentClassified.kind === "text" && authoredClassified.kind === "text") {
                const context = canonicalDiff(baseClassified.tokens, currentClassified.tokens);
                const transformed = transformEdit(change.edit, context);
                if (!transformed.ok)
                    return transformed;
                const applied = applyEdit(currentClassified.tokens, transformed.value);
                if (!applied.ok)
                    return applied;
                resolved = textEncoder.encode(joinTextTokens(applied.value));
            }
            else {
                const conflict = resolvePathConflict(change.path, baseContent, currentContent, authoredContent, change);
                resolved = conflict.content;
                if (conflict.warning !== undefined)
                    warnings.push(conflict.warning);
            }
        }
        else {
            const conflict = resolvePathConflict(change.path, baseContent, currentContent, authoredContent, change);
            resolved = conflict.content;
            if (conflict.warning !== undefined)
                warnings.push(conflict.warning);
        }
        if (resolved === undefined)
            removals.add(change.path);
        else
            installations.set(change.path, resolved);
    }
    const next = new Map(current);
    for (const path of removals)
        next.delete(path);
    for (const [path, content] of installations)
        next.set(path, content);
    const constructed = constructFileTree(next.entries());
    if (!constructed.ok)
        return constructed;
    return ok(Object.freeze({ tree: constructed.value, warnings: sortWarningFacts(warnings) }));
}
