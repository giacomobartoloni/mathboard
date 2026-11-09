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
import { ANALYTICS_EVENTS } from '../analytics/events.js'

// Owns the Graph editor lifecycle; the board controller remains responsible for mutations.
export function usePlotEditor({ drawBoardRef, selectedTool, trackEvent }) {
  const showPlotModal = ref(false)
  const editingPlotSpec = ref(null)
  const plotBusy = ref(false)
  const plotError = ref('')
  let editingPlotId = null
  let mode = 'create'
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
    if (!showPlotModal.value || plotBusy.value) return
    trackEvent(ANALYTICS_EVENTS.PLOT_MODAL_CANCELLED, { mode })
    await dismissPlotModal()
  }

  const onOpenPlot = (position) => {
    mode = 'create'
    plotPosition = position
    plotReturnFocus = document.activeElement
    editingPlotSpec.value = null
    editingPlotId = null
    plotError.value = ''
    showPlotModal.value = true
    trackEvent(ANALYTICS_EVENTS.PLOT_MODAL_OPENED, { mode })
  }

  const onEditPlot = ({ spec, id }) => {
    mode = 'edit'
    plotPosition = null
    plotReturnFocus = document.activeElement
    editingPlotSpec.value = spec
    editingPlotId = id
    plotError.value = ''
    showPlotModal.value = true
    trackEvent(ANALYTICS_EVENTS.PLOT_MODAL_OPENED, { mode })
  }

  const onSubmitPlot = async (spec) => {
    if (!showPlotModal.value || plotBusy.value) return
    plotBusy.value = true
    plotError.value = ''
    trackEvent(ANALYTICS_EVENTS.PLOT_SUBMITTED, { mode })
    let saved = false
    try {
      await drawBoardRef.value.savePlot(spec, editingPlotId, plotPosition)
      saved = true
    } catch (error) {
      trackEvent(ANALYTICS_EVENTS.PLOT_SAVE_FAILED, { mode })
      plotError.value = error?.cause?.message || error?.message
        || 'Could not save this graph. Please try again.'
    } finally {
      plotBusy.value = false
    }
    if (saved) await dismissPlotModal()
  }

  return {
    showPlotModal, editingPlotSpec, plotBusy, plotError,
    onOpenPlot, onEditPlot, onSubmitPlot, closePlotModal,
  }
}
