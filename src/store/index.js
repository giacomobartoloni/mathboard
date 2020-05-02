import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export default new Vuex.Store({
    state: {
      selectedTool: "pencil"
    },
    mutations: {
      selectTool (state, tool) {
        state.selectedTool = tool
      },
    }
  })