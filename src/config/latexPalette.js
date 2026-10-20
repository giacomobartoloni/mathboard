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

export const CURSOR = '§CURSOR§'
export const SELECTION = '§SELECTION§'

export const QUICK_INSERT_ITEMS = [
  {
    id: 'fraction',
    label: 'Fraction',
    ariaLabel: 'Insert fraction',
    preview: '\\frac{a}{b}',
    template: `\\frac{${CURSOR}}{}`,
    selectionTemplate: `\\frac{${SELECTION}}{${CURSOR}}`
  },
  {
    id: 'sqrt',
    label: 'Square root',
    ariaLabel: 'Insert square root',
    preview: '\\sqrt{x}',
    template: `\\sqrt{${CURSOR}}`,
    selectionTemplate: `\\sqrt{${SELECTION}}${CURSOR}`
  },
  {
    id: 'power',
    label: 'Power',
    ariaLabel: 'Insert exponent',
    preview: 'x^{n}',
    template: `^{${CURSOR}}`
  },
  {
    id: 'subscript',
    label: 'Subscript',
    ariaLabel: 'Insert subscript',
    preview: 'x_{i}',
    template: `_{${CURSOR}}`
  },
  {
    id: 'sum',
    label: 'Sum',
    ariaLabel: 'Insert summation',
    preview: '\\sum_{i=1}^{n}',
    template: `\\sum_{${CURSOR}}^{}`
  },
  {
    id: 'integral',
    label: 'Integral',
    ariaLabel: 'Insert integral',
    preview: '\\int_{a}^{b}',
    template: `\\int_{${CURSOR}}^{}`
  },
  {
    id: 'limit',
    label: 'Limit',
    ariaLabel: 'Insert limit',
    preview: '\\lim_{x \\to 0}',
    template: `\\lim_{${CURSOR}}`
  },
  {
    id: 'parentheses',
    label: 'Parentheses',
    ariaLabel: 'Wrap in parentheses',
    preview: '\\left(x\\right)',
    template: `\\left(${CURSOR}\\right)`,
    selectionTemplate: `\\left(${SELECTION}\\right)${CURSOR}`
  },
  {
    id: 'absolute-value',
    label: 'Absolute value',
    ariaLabel: 'Wrap in absolute value',
    preview: '\\left|x\\right|',
    template: `\\left|${CURSOR}\\right|`,
    selectionTemplate: `\\left|${SELECTION}\\right|${CURSOR}`
  }
]

function symbol(id, latex, label) {
  return {
    id,
    label,
    ariaLabel: `Insert ${label}`,
    preview: latex,
    template: `${latex} `
  }
}

export const LATEX_PALETTE_GROUPS = [
  {
    id: 'symbols',
    label: 'Symbols',
    items: [
      symbol('times', '\\times', 'times'),
      symbol('cdot', '\\cdot', 'dot'),
      symbol('pm', '\\pm', 'plus-minus'),
      symbol('infty', '\\infty', 'infinity'),
      symbol('partial', '\\partial', 'partial'),
      symbol('nabla', '\\nabla', 'nabla'),
      symbol('to', '\\to', 'to'),
      symbol('rightarrow', '\\rightarrow', 'right arrow'),
      symbol('leftarrow', '\\leftarrow', 'left arrow')
    ]
  },
  {
    id: 'greek',
    label: 'Greek',
    items: [
      symbol('alpha', '\\alpha', 'alpha'),
      symbol('beta', '\\beta', 'beta'),
      symbol('gamma', '\\gamma', 'gamma'),
      symbol('delta', '\\delta', 'delta'),
      symbol('theta', '\\theta', 'theta'),
      symbol('lambda', '\\lambda', 'lambda'),
      symbol('mu', '\\mu', 'mu'),
      symbol('pi', '\\pi', 'pi'),
      symbol('rho', '\\rho', 'rho'),
      symbol('sigma', '\\sigma', 'sigma'),
      symbol('phi', '\\phi', 'phi'),
      symbol('omega', '\\omega', 'omega'),
      symbol('Delta', '\\Delta', 'Delta'),
      symbol('Gamma', '\\Gamma', 'Gamma'),
      symbol('Lambda', '\\Lambda', 'Lambda'),
      symbol('Pi', '\\Pi', 'Pi'),
      symbol('Sigma', '\\Sigma', 'Sigma'),
      symbol('Phi', '\\Phi', 'Phi'),
      symbol('Omega', '\\Omega', 'Omega')
    ]
  },
  {
    id: 'relations',
    label: 'Relations',
    items: [
      {
        id: 'eq',
        label: 'equals',
        ariaLabel: 'Insert equals',
        preview: '=',
        template: '='
      },
      symbol('neq', '\\neq', 'not equal'),
      {
        id: 'lt',
        label: 'less than',
        ariaLabel: 'Insert less than',
        preview: '<',
        template: '<'
      },
      {
        id: 'gt',
        label: 'greater than',
        ariaLabel: 'Insert greater than',
        preview: '>',
        template: '>'
      },
      symbol('leq', '\\leq', 'less than or equal'),
      symbol('geq', '\\geq', 'greater than or equal'),
      symbol('approx', '\\approx', 'approximately equal'),
      symbol('equiv', '\\equiv', 'equivalent'),
      symbol('in', '\\in', 'element of'),
      symbol('notin', '\\notin', 'not element of'),
      symbol('subset', '\\subset', 'subset'),
      symbol('subseteq', '\\subseteq', 'subset or equal'),
      symbol('Rightarrow', '\\Rightarrow', 'implies'),
      symbol('Leftrightarrow', '\\Leftrightarrow', 'if and only if')
    ]
  }
]
