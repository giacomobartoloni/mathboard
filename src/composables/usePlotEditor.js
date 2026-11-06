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

import { nextTick, ref } from 'vue'

// Owns the Graph editor lifecycle; the board controller remains responsible for mutations.
export function usePlotEditor({ drawBoardRef, selectedTool }) {
  const showPlotModal = ref(false)
  const editingPlotSpec = ref(null)
  const plotBusy = ref(false)
  const plotError = ref('')
  let editingPlotId = null
  let plotPosition = null
  let plotReturnFocus = null

  const dismissPlotModal = async () => {
    showPlotModal.value = false
    plotPosition = null
    selectedTool.value = 'select'
    await nextTick()
    const target = plotReturnFocus?.isConnected
      && plotReturnFocus.matches('button,a[href],input,textarea,select,[tabindex]')
      ? plotReturnFocus
      : document.querySelector('button[aria-label="Graph"]')
    target?.focus()
  }

  const closePlotModal = async () => {
    if (plotBusy.value) return
    await dismissPlotModal()
  }

  const onOpenPlot = (position) => {
    plotPosition = position
    plotReturnFocus = document.activeElement
    editingPlotSpec.value = null
    editingPlotId = null
    plotError.value = ''
    showPlotModal.value = true
  }

  const onEditPlot = ({ spec, id }) => {
    plotPosition = null
    plotReturnFocus = document.activeElement
    editingPlotSpec.value = spec
    editingPlotId = id
    plotError.value = ''
    showPlotModal.value = true
  }

  const onSubmitPlot = async (spec) => {
    if (plotBusy.value) return
    plotBusy.value = true
    plotError.value = ''
    try {
      await drawBoardRef.value.savePlot(spec, editingPlotId, plotPosition)
      // A successful save may close the editor while the external close action is locked.
      await dismissPlotModal()
    } catch (error) {
      plotError.value = error?.cause?.message || error?.message
        || 'Could not save this graph. Please try again.'
    } finally {
      plotBusy.value = false
    }
  }

  return {
    showPlotModal, editingPlotSpec, plotBusy, plotError,
    onOpenPlot, onEditPlot, onSubmitPlot, closePlotModal,
  }
}
