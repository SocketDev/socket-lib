// Same stub as split-by-leaf — provides ArrayPrototypePush so the
// codemod's surface includes it.
export const ArrayPrototypePush = Function.prototype.call.bind(
  Array.prototype.push,
)
