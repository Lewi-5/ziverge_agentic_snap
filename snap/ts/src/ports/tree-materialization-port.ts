import type { TreeMutationPlan } from "../domain/tree/mutation-plan.js";

export interface TreeMaterializationPort {
  /** Applies a completely prepared plan below repositoryRoot without touching `.snap`. */
  readonly apply: (repositoryRoot: string, plan: TreeMutationPlan) => Promise<void>;
}
