import Vue from 'vue'
import store from './store/index.js'
import App from './App.vue'

import { library } from '@fortawesome/fontawesome-svg-core'
import { faMousePointer } from '@fortawesome/free-solid-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons'
import { faFont } from '@fortawesome/free-solid-svg-icons'
import { faHandPaper } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
 
library.add(faMousePointer)
library.add(faFont)
library.add(faHandPaper)
library.add(faPencilAlt)
 
Vue.component('font-awesome-icon', FontAwesomeIcon)
 
Vue.config.productionTip = false

new Vue({
  render: h => h(App),
  store: store,
}).$mount('#app')
