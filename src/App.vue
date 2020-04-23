<template>
  <div id="app">
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <Board :id="'board'"/>
    <ToolsPanel />
  </div>
</template>

<script>
import Board from './components/Board.vue'
import ToolsPanel from './components/ToolsPanel.vue'

export default {
  name: 'App',
  components: {
    Board,
    ToolsPanel
  }
}
</script>

<style>
body {
  margin: 0px;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
.logo {
  font-family: 'Satisfy', cursive;
  font-size: normal;
  
  color: whitesmoke;
  background-color: rgb(61, 61, 61);
  border-radius: 5px;
  padding: 5px 10px ;
  border: tan 3px solid;

    position: absolute;
    z-index: 10;
    left: 12px;
    top: 12px;
    display: -ms-flexbox;
    display: flex;
    -ms-flex-direction: row;
    flex-direction: row;
    z-index: 200;

}
</style>
