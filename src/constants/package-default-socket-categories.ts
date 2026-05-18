/**
 * @file Default Socket security categories for packages.
 */

import { ObjectFreeze } from '../primordials/object'
// Default category for new packages
const packageDefaultSocketCategories = ObjectFreeze(['cleanup'])

export { packageDefaultSocketCategories }
