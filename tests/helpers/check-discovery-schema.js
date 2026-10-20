/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export function acceptsSchema(schema, value, root = schema) {
  if (schema.$ref) return acceptsSchema(schema.$ref.slice(2).split('/').reduce((node, key) => node[key], root), value, root)
  if (schema.const !== undefined && value !== schema.const) return false
  if (schema.enum && !schema.enum.includes(value)) return false
  if (schema.oneOf && schema.oneOf.filter(part => acceptsSchema(part, value, root)).length !== 1) return false
  if (schema.anyOf && !schema.anyOf.some(part => acceptsSchema(part, value, root))) return false
  if (schema.type) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    if (![schema.type].flat().includes(actual)) return false
    if (actual === 'number' && !Number.isFinite(value)) return false
  }
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum)
    || (schema.maximum !== undefined && value > schema.maximum)
    || (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
    || (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum))) return false
  if (typeof value === 'string' && (value.length < (schema.minLength || 0) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) return false
  if (Array.isArray(value) && (value.length < (schema.minItems || 0)
    || (schema.maxItems !== undefined && value.length > schema.maxItems)
    || !Array.from(value).every(item => acceptsSchema(schema.items || {}, item, root)))) return false
  if (value && !Array.isArray(value) && typeof value === 'object') {
    if (schema.required?.some(key => !(key in value))) return false
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        if (!acceptsSchema(schema.properties[key], item, root)) return false
      } else if (schema.additionalProperties === false) return false
    }
  }
  return true
}
