<template>
  <div class="tools-panel">
    <!--     <img alt="Vue logo" src="../assets/logo.png" width="30px" /> -->
    <div :class="{ selected: selected === 'pencil' }" v-on:click="select('pencil')" >
      <font-awesome-icon icon="pencil-alt" />
    </div>
    <div :class="{ selected: selected === 'pan' }" v-on:click="select('pan')" >
      <font-awesome-icon :icon="['far', 'hand-paper']" />
    </div>
    <div :class="{ selected: selected === 'font' }" v-on:click="select('font')" >
      <font-awesome-icon icon="font" />
    </div>
  </div>
</template>

<script>
export default {
  name: "ToolsPanel",
  data() {
    return {
      selected: "pencil",
      pencil: {
        width: 10,
        color: "(187, 187, 187)",
      },
      pan: {
      },
      text: {
      },
    };
  },
  methods: {
    select: function (element) {
      this.selected = element;
    }
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.tools-panel {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: 76px;

  background-color: rgb(245, 244, 244);
  color: rgb(61, 61, 61);
  border-radius: 5px;
  padding: 5px 5px;
  border: rgb(187, 187, 187) 1px solid;
}

.tools-panel div {
  padding: 5px 10px;
  border-radius: 5px;
}

.tools-panel div.selected {
  background-color: rgb(214, 214, 214);
}
</style>
