export function parallelMap<T, R>(
  concurrency: number,
  mapper: (value: T) => Promise<R> | R,
  iterable: AsyncIterable<T> | Iterable<T>,
): AsyncIterableIterator<R>

export function transform<T, R>(
  concurrency: number,
  func: (data: T) => R | Promise<R>,
  iterable: AsyncIterable<T> | Iterable<T>,
): AsyncIterableIterator<R>
