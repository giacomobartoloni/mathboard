/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { createMathBoardObjectId } from '../board/ids.js'
import { validateBoardDocument } from '../board/persistence/schema.js'

/** Copy an entire semantic document, renewing identities without flattening groups. */
export function copyBoardDocumentWithFreshIds(source) {
  const document = JSON.parse(JSON.stringify(validateBoardDocument(source)))
  const visit = node => {
    node.id = createMathBoardObjectId()
    if (node.type === 'group') node.objects.forEach(visit)
  }
  document.objects.forEach(visit)
  return validateBoardDocument(document)
}
