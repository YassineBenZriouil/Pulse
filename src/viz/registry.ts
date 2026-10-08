import { GridEngine } from './grid'
import { LiquidEngine } from './liquid'
import { NcsCircleEngine } from './ncsCircle'
import { ParticlesEngine } from './particles'
import { RadialWaveEngine } from './radialWave'
import { SpectrumBarsEngine } from './spectrumBars'
import type { EngineFactory, ParamDef, VisualizationEngine } from './types'
import { WaveformEngine } from './waveform'

export interface VizDescriptor {
  id: string
  name: string
  description: string
  create: EngineFactory
}

/** Order = display order in the left sidebar. Add new engines here only. */
export const VIZ_ENGINES: VizDescriptor[] = [
  descriptor(NcsCircleEngine),
  descriptor(SpectrumBarsEngine),
  descriptor(WaveformEngine),
  descriptor(RadialWaveEngine),
  descriptor(ParticlesEngine),
  descriptor(LiquidEngine),
  descriptor(GridEngine),
]

function descriptor(ctor: new () => VisualizationEngine): VizDescriptor {
  const sample = new ctor()
  return {
    id: sample.id,
    name: sample.name,
    description: sample.description,
    create: () => new ctor(),
  }
}

export function getViz(id: string): VizDescriptor {
  return VIZ_ENGINES.find((v) => v.id === id) ?? VIZ_ENGINES[0]
}

/** Schema for a viz without instantiating it in the render loop. */
export function vizParams(id: string): ParamDef[] {
  return getViz(id).create().params
}
