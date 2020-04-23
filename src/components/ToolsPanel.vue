<template>
  <div class="tools-panel">
    <img alt="Vue logo" src="../assets/logo.png" width="30px" />
  </div>
</template>

<script>
export default {
  name: "ToolsPanel",
  data() {
    return {
      pencil: {
          selected: true,
          width: 10,
          color: "(187, 187, 187)"
      },
    };
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

  background-color: whitesmoke;
  color: rgb(61, 61, 61);
  border-radius: 5px;
  padding: 5px 10px;
  border: rgb(187, 187, 187) 1px solid;
}
</style>
