// Minimal stub primordials. `prim mod` reads this to know
// `ArrayPrototypePush` exists; the harness will skip rewrites INSIDE this
// dir.
export const ArrayPrototypePush = Function.prototype.call.bind(
  Array.prototype.push,
)
