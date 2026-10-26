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

const FIRST_NAMES = Object.freeze([
  'albert', 'ada', 'emmy', 'leonhard', 'carl', 'bernhard', 'sofya', 'alan',
  'blaise', 'pierre', 'henri', 'isaac', 'kurt', 'david', 'maryam', 'rene',
  'hypatia', 'augusta', 'john',
])

const SURNAMES = Object.freeze([
  'fermat', 'gauss', 'noether', 'euler', 'lovelace', 'riemann', 'turing',
  'pascal', 'ramanujan', 'hilbert', 'galois', 'poincare', 'cantor',
  'grothendieck', 'banach', 'fourier', 'laplace', 'newton', 'euclid',
  'mirzakhani', 'lagrange', 'abel', 'bernoulli', 'cauchy', 'erdos',
])

const MATH_TERMS = Object.freeze([
  'parabola', 'matrix', 'vector', 'lemma', 'theorem', 'integral', 'gradient',
  'polynomial', 'tensor', 'manifold', 'ellipse', 'sequence', 'hyperbola',
  'proof', 'limit', 'series', 'conjecture', 'fractal', 'eigenvalue',
  'modulus', 'isomorphism', 'axiom', 'topology', 'symmetry', 'derivative',
  'function', 'prime', 'infinity', 'combinatorics', 'geometry',
])

const MODIFIERS = Object.freeze([
  'flashy', 'brilliant', 'curious', 'elegant', 'clever', 'nimble', 'witty',
  'bold', 'playful', 'chaotic', 'infinite', 'symmetric', 'fractal',
  'radical', 'axiomatic', 'prime', 'stellar', 'mysterious', 'spirited',
  'recursive',
])

const PAIRS = Object.freeze([
  [MODIFIERS, SURNAMES],
  [FIRST_NAMES, MATH_TERMS],
  [MATH_TERMS, SURNAMES],
  [FIRST_NAMES, SURNAMES],
])

/** Generate a lowercase, two-word mathematical board name. */
export function generateBoardName(random = Math.random) {
  const [left, right] = PAIRS[Math.floor(random() * PAIRS.length)]
  const pick = words => words[Math.floor(random() * words.length)]
  return `${pick(left)}-${pick(right)}`
}
