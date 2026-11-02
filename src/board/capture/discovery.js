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

import { CAPTURE_LIMITS } from './contract.js'

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false})
const number={type:'number'}
const rect=object({x:number,y:number,width:{type:'number',exclusiveMinimum:0},height:{type:'number',exclusiveMinimum:0}})
const target={oneOf:[
  object({kind:{const:'sceneRect'},rect}),
  object({kind:{const:'objectIds'},ids:{type:'array',minItems:1,maxItems:CAPTURE_LIMITS.maxSceneObjects,uniqueItems:true,
    items:{type:'string',pattern:'\\S'}},padding:{type:'number',minimum:0,maximum:CAPTURE_LIMITS.maxPadding,default:16}},['kind','ids']),
  object({kind:{const:'viewport'}}),
]}

/** Detached capture schema; exporting it never enables a command route. */
export function getScreenshotDescriptor() {
  return structuredClone({
    method:'screenshot', summary:'Read the rendered live board as a bounded PNG, without changing board state.',
    mutatesBoard:false,requiresStable:true,
    paramsSchema:object({target,scale:{type:'number',minimum:CAPTURE_LIMITS.minScale,maximum:CAPTURE_LIMITS.maxScale,default:1},
      format:{const:'png',default:'png'}},['target']),
    resultSchema:object({mimeType:{const:'image/png'},encoding:{const:'base64'},
      data:{type:'string',contentEncoding:'base64',contentMediaType:'image/png',maxLength:CAPTURE_LIMITS.maxBase64Chars},
      widthPx:{type:'integer',minimum:1,maximum:CAPTURE_LIMITS.maxDimension},
      heightPx:{type:'integer',minimum:1,maximum:CAPTURE_LIMITS.maxDimension},
      region:{type:'object',required:['kind','coordinateSpace','x','y','width','height'],
        properties:{kind:{enum:['sceneRect','objectIds','viewport']},coordinateSpace:{enum:['scene','viewport']},
          x:number,y:number,width:number,height:number,requestedRect:rect,unionBounds:rect,
          ids:{type:'array',items:{type:'string'}},padding:number,
          viewportTransform:{type:'array',minItems:6,maxItems:6,items:number}},additionalProperties:false},
      scale:{type:'number',minimum:CAPTURE_LIMITS.minScale,maximum:CAPTURE_LIMITS.maxScale},
      boardId:{type:'string'},observationVersion:{const:1}}),
    example:{method:'screenshot',params:{target:{kind:'sceneRect',rect:{x:200,y:120,width:800,height:600}},scale:1,format:'png'}},
    limits:{...CAPTURE_LIMITS},
    limitations:[
      'Captures the board canvas only; toolbar/DOM occlusion requires the F017 workspace screenshot workflow.',
      'objectIds accepts existing top-level semantic IDs only; formula vectors remain atomic.',
      'sceneRect/objectIds use scene units independent of live pan/zoom; viewport uses CSS viewport pixels and the returned transform.',
      'The PNG is visual evidence, not automatic proof of layout quality. Capture never grants permission to mutate.',
      'External image resources, canvas background/overlay images and canvas clip paths are rejected.',
    ],
  })
}
