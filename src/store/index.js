import Vue from "vue";
import Vuex from "vuex";

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    selectedTool: "pencil",
    toolsSettings: {
      pencil: {
        width: 10,
        color: "(187, 187, 187)",
      },
      pan: {},
      text: {},
    },
  },
  mutations: {
    selectTool(state, tool) {
      state.selectedTool = tool;
    },
  },
});
