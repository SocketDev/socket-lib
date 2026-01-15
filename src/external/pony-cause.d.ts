export class ErrorWithCause extends Error {
  constructor(message: string, options?: { cause?: unknown })
}

export function findCauseByReference(
  error: Error,
  reference: Error,
): Error | undefined

export function getErrorCause(error: Error): Error | undefined

export function stackWithCauses(error: Error): string

export function messageWithCauses(error: Error): string
