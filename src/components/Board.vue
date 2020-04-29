<template>
  <div id="boardcontainer">
    <canvas :id="id"></canvas>
  </div>
</template>

<script>
let canvasEvents = [
  //Static Canvas events
  "before:render",
  "after:render",
  "canvas:cleared",
  "object:added",
  "object:removed",
  //Canvas events
  "object:modified",
  "object:rotated",
  "object:scaled",
  "object:moved",
  "object:skewed",
  "object:rotating",
  "object:scaling",
  "object:moving",
  "object:skewing",
  "before:transform",
  "before:selection:cleared",
  "selection:cleared",
  "selection:updated",
  "selection:created",
  "path:created",
  "mouse:down",
  "mouse:move",
  "mouse:up",
  "mouse:down:before",
  "mouse:move:before",
  "mouse:up:before",
  "mouse:over",
  "mouse:out",
  "mouse:dblclick",
  "dragover",
  "dragenter",
  "dragleave",
  "drop",
];

import * as fabric from "fabric";
import fabricStaticCanvas from "./fabricStaticCanvas";

export default {
  name: "Board",
  mixins: [fabricStaticCanvas],
  props: {
    id: { type: String, required: false, default: "c" },
  },
  data() {
    return {
      canvas: null,
      type: "canvas",
      windowWidth: 0,
      windowHeight: 0,
    };
  },
  provide() {
    return {
      $canvas: () => this.canvas,
      $group: () => null,
      fabric,
    };
  },
  methods: {
    fitToContainer(canvas) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    },
    createEvents() {
      canvasEvents.forEach((event) => {
        let vueEvent = event.split(":").join("-");
        this.canvas.on(event, (e) => {
          this.$emit(vueEvent, e);
        });
      });
    },
    getWindowWidth() {
      this.windowWidth = document.documentElement.clientWidth;
      //console.log(this.windowWidth);
      this.canvas.setWidth(this.windowWidth);
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },

    getWindowHeight() {
      this.windowHeight = document.documentElement.clientHeight;
      //console.log(this.windowHeight);
      this.canvas.setHeight(this.windowHeight);
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
  },
  computed: {
    definedProps() {
      const obj = { ...this.$props };
      Object.keys(obj).forEach((key) => {
        if (obj[key] === undefined) {
          delete obj[key];
        }
      });
      return obj;
    },
  },
  mounted() {
    var canvas = document.querySelector("canvas");
    this.fitToContainer(canvas);
    this.canvas = new fabric.fabric.Canvas(this.id, {
      ...this.definedProps,
    });
    this.canvas.freeDrawingBrush = new fabric.fabric["PencilBrush"](
      this.canvas
    );

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = "#000000";
      canvas.freeDrawingBrush.width = parseInt(10, 10) || 1;
      canvas.freeDrawingBrush.shadow = new fabric.fabric.Shadow({
        blur: parseInt(0, 10) || 0,
        offsetX: 0,
        offsetY: 0,
        affectStroke: true,
        color: "#000000",
      });
    }

    this.createEvents();
    this.$nextTick(function() {
      window.addEventListener("resize", this.getWindowWidth);
      window.addEventListener("resize", this.getWindowHeight);

      //Init
      this.getWindowWidth();
      this.getWindowHeight();
    });
  },
  beforeDestroy() {
    canvasEvents.forEach((event) => {
      let vueEvent = event.split(":").join("-");
      this.canvas.off(event, this.$emit(vueEvent));
    });
    window.removeEventListener("resize", this.getWindowWidth);
    window.removeEventListener("resize", this.getWindowHeight);
  },

  watch: {
    canvas: {
      handler() {
        this.$emit("canvas-updated", this.canvas);
      },
      deep: true,
      initial: true,
    },
    height(newValue) {
      console.log(newValue);
      this.canvas.setHeight(newValue);
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
    width(newValue) {
      console.log(newValue);
      this.canvas.setWidth(newValue);
      this.canvas.renderAll();
      this.canvas.calcOffset();
    },
  },
};

/* function fitToContainer(canvas){
  canvas.style.width='100%';
  canvas.style.height='100%';
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
} */
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
div#boardcontainer {
  background: red;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: -1000;
}
canvas {
  background: rgba(255, 255, 255, 0.6);
}
canvas {
  background: url("../assets/square.svg") #f9f9f9 repeat;
  background-size: 40px 40px;
  width: 100%;
  height: 100%; }
</style>
