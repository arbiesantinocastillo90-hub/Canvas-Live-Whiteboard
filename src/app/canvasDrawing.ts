import type { LinePattern } from './lcanvas'

export function lineDash(pattern?: LinePattern): string | undefined {
  return pattern === 'dashed' ? '8 5' : pattern === 'dotted' ? '1 5' : undefined
}
