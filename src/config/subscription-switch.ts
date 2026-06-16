import { generateRuntimeConfig } from './runtime.js'
import { findSubscription, readSubscriptions, writeSubscriptions } from './subscriptions.js'
import { restartServiceProcess, serviceStatus } from '../service/service.js'
import type { SubscriptionItem, SubscriptionState } from '../lib/types.js'
import { errorMessage, MihoroError } from '../lib/errors.js'

export interface SubscriptionSwitchResult {
  /** Selected subscription item. */
  item: SubscriptionItem
  /** Generated runtime config path. */
  runtimePath: string
  /** Restarted mihomo process id when mihomo was running before the switch. */
  restartedPid?: number
}

/**
 * Switches the active subscription and refreshes mihomo runtime state when needed.
 *
 * @param idOrName Subscription id or name.
 * @returns Selected subscription, runtime path, and optional restarted process id.
 */
export async function switchSubscription(idOrName: string): Promise<SubscriptionSwitchResult> {
  const previousState = await readSubscriptions()
  const item = findSubscription(previousState, idOrName)
  await writeSubscriptions({ ...previousState, current: item.id })

  try {
    const runtimePath = await generateRuntimeConfig()
    const restartedPid = await restartRunningService()
    return { item, runtimePath, restartedPid }
  } catch (error) {
    return await rollbackSubscription(previousState, error)
  }
}

/**
 * Restarts mihomo only when it is already running.
 *
 * @returns Restarted pid, or undefined when mihomo is not running.
 */
async function restartRunningService(): Promise<number | undefined> {
  const status = await serviceStatus()
  if (!status.startsWith('running ')) return undefined
  return restartServiceProcess()
}

/**
 * Restores the previous subscription state and runtime config after a failed switch.
 *
 * @param previousState Subscription state captured before switching.
 * @param originalError Error that caused the rollback.
 * @returns Never returns because it always throws the original or combined error.
 */
async function rollbackSubscription(previousState: SubscriptionState, originalError: unknown): Promise<never> {
  try {
    await writeSubscriptions(previousState)
    if (previousState.current) await generateRuntimeConfig()
  } catch (rollbackError) {
    throw new MihoroError(
      `Subscription switch failed and rollback failed: ${errorMessage(originalError)}; rollback: ${errorMessage(rollbackError)}`
    )
  }
  throw new MihoroError(`Subscription switch failed and was rolled back: ${errorMessage(originalError)}`)
}
