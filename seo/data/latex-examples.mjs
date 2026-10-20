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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/** Shared LaTeX examples for SEO pages. Build fails if any source does not compile. */
export const LATEX_EXAMPLES = [
  {
    category: 'Basics',
    label: 'Energy equation',
    source: 'E = mc^2',
  },
  {
    category: 'Fractions',
    label: 'Simple fraction',
    source: '\\frac{a}{b}',
  },
  {
    category: 'Fractions',
    label: 'Rational expression',
    source: '\\frac{x+1}{x-1}',
  },
  {
    category: 'Powers and roots',
    label: 'Square root',
    source: '\\sqrt{x^2 + y^2}',
  },
  {
    category: 'Powers and roots',
    label: 'Cube root and power',
    source: '\\sqrt[3]{8} = 2^3',
  },
  {
    category: 'Integrals and sums',
    label: 'Definite integral',
    source: '\\int_{a}^{b} f(x)\\,dx',
  },
  {
    category: 'Integrals and sums',
    label: 'Summation',
    source: '\\sum_{n=1}^{N} n^2',
  },
  {
    category: 'Greek letters',
    label: 'Common Greek letters',
    source: '\\alpha, \\beta, \\gamma, \\theta, \\pi, \\Delta',
  },
  {
    category: 'Subscripts and superscripts',
    label: 'Indexed variable',
    source: 'a_{n}^{2}',
  },
  {
    category: 'Brackets',
    label: 'Absolute value and norm',
    source: '\\left| x \\right| + \\left\\| v \\right\\|',
  },
]

/** Subset featured on the LaTeX whiteboard landing page. */
export const LATEX_WHITEBOARD_FEATURED = [
  'E = mc^2',
  '\\frac{a}{b}',
  '\\sqrt{x^2 + y^2}',
  '\\int_{a}^{b} f(x)\\,dx',
]
