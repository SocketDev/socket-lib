/**
 * @fileoverview Safe references to `Reflect.*`.
 *
 * **IMPORTANT**: do not destructure on `Reflect` here. tsgo has a bug
 * that mis-transpiles destructured exports.
 * See: https://github.com/SocketDev/socket-packageurl-js/issues/3
 */

export const ReflectApply = Reflect.apply
export const ReflectConstruct = Reflect.construct
export const ReflectDefineProperty = Reflect.defineProperty
export const ReflectDeleteProperty = Reflect.deleteProperty
export const ReflectGet = Reflect.get
export const ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor
export const ReflectGetPrototypeOf = Reflect.getPrototypeOf
export const ReflectHas = Reflect.has
export const ReflectIsExtensible = Reflect.isExtensible
export const ReflectOwnKeys = Reflect.ownKeys
export const ReflectPreventExtensions = Reflect.preventExtensions
export const ReflectSet = Reflect.set
export const ReflectSetPrototypeOf = Reflect.setPrototypeOf
