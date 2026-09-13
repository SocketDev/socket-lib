import { getPowerSnapshot, getPowerState } from '@socketsecurity/lib/power'

export async function run() {
  return { state: await getPowerState(), snapshot: await getPowerSnapshot() }
}
