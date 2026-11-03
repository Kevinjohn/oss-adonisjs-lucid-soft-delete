/** One `pnpm` script run by `pnpm check`, optionally inside an example application. */
export interface CheckStep {
  script: string
  args?: string[]
  directory?: string
  env?: Record<string, string>
}
export type CheckProfile = 'quick' | 'full'

/** Steps per profile. `full` runs after `quick`; together they cover the local CI checks. */
export const checkProfiles: Record<CheckProfile, CheckStep[]> = {
  quick: [
    { script: 'format:check' },
    { script: 'lint' },
    { script: 'docs:check' },
    { script: 'typecheck' },
    { script: 'quick:test' },
    { script: 'build' },
    { script: 'test:built-exports' },
  ],
  full: [
    { script: 'test:pg' },
    { script: 'test' },
    { script: 'test:mysql' },
    { script: 'test:consumer' },
  ],
}

export function selectedSteps(flags: string[]): CheckStep[] {
  const unknown = flags.filter((flag) => flag !== '--full')
  if (unknown.length > 0) throw new Error(`Use pnpm check [--full]; got ${unknown}`)
  return [...checkProfiles.quick, ...(flags.includes('--full') ? checkProfiles.full : [])]
}
