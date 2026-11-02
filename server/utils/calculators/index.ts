// The research agent's deterministic tools: the model plans, numbers come from here. Each run() validates its own
// arguments and throws a plain-English Error the model can read and correct.
import { CALENDAR_TOOLS } from './calendar.ts'
import { FORENSICS_TOOLS } from './forensics.ts'
import { PHYSICS_TOOLS } from './physics.ts'
import { SKY_TOOLS } from './sky.ts'
import { TRAVEL_TOOLS } from './travel.ts'

export interface Calculator {
  name: string, description: string, parameters: Record<string, unknown>
  run: (args: any) => { result: unknown, assumptions: string[] }
}

export const CALCULATORS: Calculator[] = [...PHYSICS_TOOLS, ...CALENDAR_TOOLS, ...SKY_TOOLS, ...TRAVEL_TOOLS, ...FORENSICS_TOOLS]
