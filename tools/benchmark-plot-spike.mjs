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

// Non-shipped G1 diagnostic: node tools/benchmark-plot-spike.mjs
import { performance } from 'node:perf_hooks'
import { tmpdir, platform, arch, cpus } from 'node:os'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { build } from 'vite'
import { chromium } from '@playwright/test'
import { ComputeEngine } from '@cortex-js/compute-engine'
import { parsePlotExpression } from '../src/plots/PlotExpression.js'
import { samplePlot } from '../src/plots/PlotSampler.js'

async function main() {
const root = fileURLToPath(new URL('../', import.meta.url))
const measure = fn => { const t = performance.now(); const value = fn(); return { ms: performance.now() - t, value } }
const memoryBefore = process.memoryUsage().heapUsed
const cold = measure(() => parsePlotExpression('x^2-5x+6'))
const expression = cold.value
const warm = measure(() => { for (let i = 0; i < 100; i++) parsePlotExpression('x^2-5x+6') })
const ce = new ComputeEngine(), reference = ce.parse('x^2-5x+6')
const heapAfterParsers = process.memoryUsage().heapUsed
const evaluations = []
for (const count of [1000, 10000]) {
  const interpreted = measure(() => { let total=0; for(let i=0;i<count;i++) total+=expression.evaluate(i/count); return total })
  const substituted = measure(() => { let total=0; for(let i=0;i<count;i++) total+=Number(reference.subs({x:i/count}).N().toString()); return total })
  assert.ok(Math.abs(interpreted.value-substituted.value)<1e-7)
  evaluations.push({count, interpretedMs:interpreted.ms, cortexSubstitutionMs:substituted.ms})
}
const heapAfterEvaluations = process.memoryUsage().heapUsed
const plots = []
for (const latex of ['x^2-5x+6','1/(x-0.12345)^2','\\sqrt{x}','\\tan(x)']) {
  const p=parsePlotExpression(latex)
  const r=measure(()=>samplePlot(p,{xMin:-2,xMax:6,yMin:-5,yMax:10}))
  plots.push({latex,ms:r.ms,status:r.value.status,diagnostics:r.value.diagnostics,points:r.value.segments.flat().length,jsonBytes:JSON.stringify(r.value).length})
}
const rejected=[]
for(const latex of ['x'.repeat(2049),'('.repeat(40)+'x'+')'.repeat(40),'x+'.repeat(300)+'x','9'.repeat(100)]) {
  let code
  const r=measure(()=>{try{parsePlotExpression(latex)}catch(e){code=e.code}})
  assert.ok(code)
  rejected.push({length:latex.length,ms:r.ms,code})
}
const heapBeforeBuild = process.memoryUsage().heapUsed
const outDir=await mkdtemp(join(tmpdir(),'mathboard-f039-vite-'))
const output=await build({root,configFile:false,logLevel:'error',build:{outDir,emptyOutDir:true,
  lib:{entry:join(root,'src/plots/PlotExpression.js'),formats:['es'],fileName:()=> 'plot.js'},minify:true}})
const assets=(Array.isArray(output) ? output : [output]).flatMap(o=>o.output).filter(a=>a.type==='chunk')
const bundle={rawBytes:0,gzipBytes:0,chunks:assets.length}
for(const a of assets){bundle.rawBytes+=Buffer.byteLength(a.code);bundle.gzipBytes+=gzipSync(a.code).length}
const requests=[], violations=[]
const server=createServer(async(req,res)=>{
  requests.push(req.url)
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'none'; style-src 'none'")
  if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>F039 CSP probe</title><script type="module" src="/probe.js"></script>');return}
  res.setHeader('Content-Type','text/javascript')
  if(req.url==='/probe.js'){res.end(`import {parsePlotExpression} from '/plot.js';
    globalThis.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.violatedDirective));
    const start=performance.now();const p=parsePlotExpression('x^2-5x+6');
    globalThis.probe={value:p.evaluate(2.5),parseMs:performance.now()-start};
    const worker=new Worker('/worker.js',{type:'module'});
    worker.onmessage=e=>{globalThis.workerResult=e.data;worker.terminate()};
    worker.postMessage('x^2-5x+6');`);return}
  if(req.url==='/worker.js'){res.end(`import {parsePlotExpression} from '/plot.js';onmessage=e=>{const p=parsePlotExpression(e.data);postMessage(p.evaluate(2.5))}`);return}
  try{res.end(await readFile(join(outDir,req.url.slice(1))))}catch{res.statusCode=404;res.end('')}
})
let browser
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  browser=await chromium.launch({headless:true})
  const page=await browser.newPage()
  page.on('pageerror',e=>violations.push(e.message))
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(()=>globalThis.workerResult===-0.25,{timeout:30000})
  const browserResult=await page.evaluate(()=>({probe:globalThis.probe,workerResult:globalThis.workerResult,cspViolations:globalThis.cspViolations}))
  assert.equal(browserResult.probe.value,-0.25)
  assert.deepEqual(browserResult.cspViolations,[])
  assert.deepEqual(violations,[])
  console.log(JSON.stringify({environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0].model,chromium:browser.version(),sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()},
    coldParseMs:cold.ms,warmParseMeanMs:warm.ms/100,evaluations,plots,rejected,heapSnapshotsBytes:{before:memoryBefore,afterParsers:heapAfterParsers,afterEvaluations:heapAfterEvaluations,beforeBuild:heapBeforeBuild,afterBrowserBuild:process.memoryUsage().heapUsed},
    bundle,browser:browserResult,requests,outDir,limitations:['single run; not a statistical performance acceptance threshold','worker smoke and termination only; no hard parser deadline proven','compile deliberately not invoked','browser imports standalone diagnostic bundle, not production app']},null,2))
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}

}

main().catch(error => { console.error(error); process.exitCode = 1 })
