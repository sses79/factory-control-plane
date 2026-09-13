/**
 * Placeholder module.
 *
 * This repository is seeded so that its declared checks — `typecheck` and `test` — have something
 * to run before any feature packet is admitted. Factory Core cannot bootstrap an empty repository,
 * because a packet's checks must pass for it to reach a draft pull request.
 *
 * The first real packet replaces this with the run read model. See the repository README.
 */
export const CONTROL_PLANE_PLACEHOLDER = 'factory-control-plane' as const;

export function placeholder(): typeof CONTROL_PLANE_PLACEHOLDER {
  return CONTROL_PLANE_PLACEHOLDER;
}
