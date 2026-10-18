import { z } from 'zod/v4'
import {
  addLayer,
  connectElements,
  createElement,
  moveElement,
  removeElement,
  reorderLayer,
  resizeElement,
  updateElement,
  updateLayer,
} from '../app/canvasOperations'
import {
  COORDINATE_LIMIT,
  LCanvasError,
  validateCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
  SHAPE_TYPES,
  CONNECTION_STYLES,
  POINTER_TYPES,
  LINE_PATTERNS,
  FONT_FAMILIES,
  EMBED_KINDS,
  validEmbedSource,
} from '../app/lcanvas'

export const MCP_MAX_READ_ELEMENTS = 100
export const MCP_MAX_BATCH_OPERATIONS = 25
export const MCP_MAX_DELETED_ELEMENTS = 10

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^\S(?:[\s\S]*\S)?$/u,
    'Identifiers must not have surrounding whitespace.',
  )
  .regex(
    // eslint-disable-next-line no-control-regex -- Reject control characters at the MCP boundary.
    /^[^\u0000-\u001f\u007f]+$/u,
    'Identifiers must not contain control characters.',
  )
const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    // eslint-disable-next-line no-control-regex -- Keep names consistent with LCANVAS validation.
    /^[^\u0000-\u001f\u007f]+$/u,
    'Names must not contain control characters.',
  )
const coordinate = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT)
const dimension = z.number().positive().max(COORDINATE_LIMIT)
const color = z.string().regex(/^#[\da-f]{6}$/iu)
const text = z
  .string()
  .max(20_000)
  // eslint-disable-next-line no-control-regex -- Plain text permits tabs and line breaks only.
  .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u)
const fontSize = z.number().min(8).max(160)
const creationBase = {
  id: identifier.optional(),
  color: color.optional(),
  layerId: identifier.optional(),
  areaId: identifier.nullable().optional(),
}
const creationSize = {
  ...creationBase,
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
}
const textFormatFields = {
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  textColor: color.optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
}
const embedFields = {
  kind: z.enum(EMBED_KINDS),
  src: z
    .string()
    .max(2048)
    .refine(validEmbedSource, 'Use HTTPS or a library media reference.'),
  title: z
    .string()
    .max(240)
    // eslint-disable-next-line no-control-regex -- Embed titles are plain labels, not arbitrary control characters.
    .regex(/^[^\u0000-\u001f\u007f]*$/u)
    .optional(),
  paused: z.boolean().optional(),
  minimized: z.boolean().optional(),
}
const shapeFields = {
  ...creationSize,
  fill: color.nullable().optional(),
  ...textFormatFields,
  text: text.optional(),
  fontSize: fontSize.optional(),
}
const connectionFields = {
  ...creationBase,
  style: z.enum(CONNECTION_STYLES).optional(),
  linePattern: z.enum(LINE_PATTERNS).optional(),
  startPointer: z.enum(POINTER_TYPES).optional(),
  endPointer: z.enum(POINTER_TYPES).optional(),
  startArrow: z.boolean().optional(),
  endArrow: z.boolean().optional(),
  fromSide: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional(),
  toSide: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional(),
}

export const newElementSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(SHAPE_TYPES), ...shapeFields }),
  z.strictObject({ type: z.literal('embed'), ...creationSize, ...embedFields }),
  z.strictObject({
    type: z.literal('text'),
    ...creationSize,
    ...textFormatFields,
    text: text.optional(),
    fontSize: fontSize.optional(),
  }),
  z.strictObject({
    type: z.literal('area'),
    ...creationSize,
    areaId: z.null().optional(),
    name: name.optional(),
    fill: color.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal('line'),
    ...creationBase,
    x: coordinate,
    y: coordinate,
    x2: coordinate,
    y2: coordinate,
    linePattern: z.enum(LINE_PATTERNS).optional(),
  }),
  z.strictObject({
    type: z.literal('connection'),
    ...connectionFields,
    fromId: identifier,
    toId: identifier,
  }),
])

export const elementPatchSchema = z
  .strictObject({
    x: coordinate.optional(),
    y: coordinate.optional(),
    width: dimension.optional(),
    height: dimension.optional(),
    x2: coordinate.optional(),
    y2: coordinate.optional(),
    color: color.optional(),
    fill: color.nullable().optional(),
    text: text.optional(),
    fontSize: fontSize.optional(),
    ...textFormatFields,
    kind: embedFields.kind.optional(),
    src: embedFields.src.optional(),
    title: embedFields.title,
    paused: embedFields.paused,
    minimized: embedFields.minimized,
    name: name.optional(),
    layerId: identifier.optional(),
    areaId: identifier.nullable().optional(),
    style: z.enum(CONNECTION_STYLES).optional(),
    linePattern: z.enum(LINE_PATTERNS).optional(),
    startPointer: z.enum(POINTER_TYPES).optional(),
    endPointer: z.enum(POINTER_TYPES).optional(),
    startArrow: z.boolean().optional(),
    endArrow: z.boolean().optional(),
    fromSide: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional(),
    toSide: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    'Choose at least one property to update.',
  )
export const connectionOptionsSchema = z.strictObject(connectionFields)
export const layerPatchSchema = z
  .strictObject({
    name: name.optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).length > 0,
    'Choose at least one layer property to update.',
  )

export const singleCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create'), element: newElementSchema }),
  z.strictObject({
    kind: z.literal('update'),
    id: identifier,
    patch: elementPatchSchema,
  }),
  z.strictObject({
    kind: z.literal('move'),
    id: identifier,
    x: coordinate,
    y: coordinate,
  }),
  z.strictObject({
    kind: z.literal('resize'),
    id: identifier,
    width: dimension,
    height: dimension,
  }),
  z.strictObject({
    kind: z.literal('connect'),
    fromId: identifier,
    toId: identifier,
    options: connectionOptionsSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('delete'), id: identifier }),
  z.strictObject({
    kind: z.literal('add_layer'),
    name,
    id: identifier.optional(),
  }),
  z.strictObject({
    kind: z.literal('update_layer'),
    id: identifier,
    patch: layerPatchSchema,
  }),
  z.strictObject({
    kind: z.literal('reorder_layer'),
    id: identifier,
    index: z.number().int().min(0).max(99),
  }),
])
export const commandSchema = z.discriminatedUnion('kind', [
  ...singleCommandSchema.options,
  z.strictObject({
    kind: z.literal('batch'),
    operations: z
      .array(singleCommandSchema)
      .min(1)
      .max(MCP_MAX_BATCH_OPERATIONS),
  }),
])
export type CanvasCommand = z.infer<typeof commandSchema>
export type SingleCanvasCommand = z.infer<typeof singleCommandSchema>
export type CanvasCommandResult = {
  document: CanvasDocument
  affectedIds: string[]
  summary: string
}

function applySingle(document: CanvasDocument, command: SingleCanvasCommand) {
  switch (command.kind) {
    case 'create':
      return createElement(document, command.element)
    case 'update':
      return updateElement(document, command.id, command.patch)
    case 'move':
      return moveElement(document, command.id, command.x, command.y)
    case 'resize':
      return resizeElement(document, command.id, command.width, command.height)
    case 'connect':
      return connectElements(
        document,
        command.fromId,
        command.toId,
        command.options,
      )
    case 'delete':
      return removeElement(document, command.id)
    case 'add_layer':
      return addLayer(document, command.name, command.id)
    case 'update_layer':
      return updateLayer(document, command.id, command.patch)
    case 'reorder_layer':
      return reorderLayer(document, command.id, command.index)
  }
}

function affectedBetween(before: CanvasDocument, after: CanvasDocument) {
  const affected = new Set<string>()
  const previousElements = new Map(
    before.elements.map((element) => [element.id, element]),
  )
  const currentElements = new Map(
    after.elements.map((element) => [element.id, element]),
  )
  for (const [id, element] of previousElements)
    if (JSON.stringify(element) !== JSON.stringify(currentElements.get(id)))
      affected.add(id)
  for (const id of currentElements.keys())
    if (!previousElements.has(id)) affected.add(id)
  for (const element of after.elements)
    if (
      element.type === 'connection' &&
      (affected.has(element.fromId) || affected.has(element.toId))
    )
      affected.add(element.id)
  for (const [index, layer] of after.layers.entries())
    if (JSON.stringify(before.layers[index]) !== JSON.stringify(layer))
      affected.add(layer.id)
  return [...affected]
}

function operationSummary(command: SingleCanvasCommand) {
  switch (command.kind) {
    case 'create':
      return `Created ${command.element.type}.`
    case 'update':
      return 'Updated canvas object.'
    case 'move':
      return 'Moved canvas object.'
    case 'resize':
      return 'Resized canvas object.'
    case 'connect':
      return 'Connected canvas objects.'
    case 'delete':
      return 'Deleted canvas object and its attached connections.'
    case 'add_layer':
      return 'Added canvas layer.'
    case 'update_layer':
      return 'Updated canvas layer.'
    case 'reorder_layer':
      return 'Reordered canvas layer.'
  }
}

/** Returns one validated transaction; callers commit this result once to their shared undo history. */
export function applyCanvasCommand(
  document: CanvasDocument,
  input: CanvasCommand,
): CanvasCommandResult {
  const command = commandSchema.parse(input)
  const operations = command.kind === 'batch' ? command.operations : [command]
  let current = validateCanvasDocument(document)
  let deleted = 0
  const affected = new Set<string>()
  for (const operation of operations) {
    const next = applySingle(current, operation)
    const remainingIds = new Set(next.elements.map((element) => element.id))
    deleted += current.elements.filter(
      (element) => !remainingIds.has(element.id),
    ).length
    if (deleted > MCP_MAX_DELETED_ELEMENTS)
      throw new LCanvasError(
        `An AI transaction may delete at most ${MCP_MAX_DELETED_ELEMENTS} objects, including attached connections.`,
      )
    for (const id of affectedBetween(current, next)) affected.add(id)
    current = next
  }
  return {
    document: validateCanvasDocument(current),
    affectedIds: [...affected],
    summary:
      command.kind === 'batch'
        ? `Applied ${operations.length} canvas operations.`
        : operationSummary(command),
  }
}

export const readOptionsSchema = z.strictObject({
  offset: z.number().int().min(0).max(5000).optional(),
  limit: z.number().int().min(1).max(MCP_MAX_READ_ELEMENTS).optional(),
  areaId: identifier.nullable().optional(),
  layerId: identifier.optional(),
})
export type CanvasReadOptions = z.infer<typeof readOptionsSchema>
export const searchQuerySchema = z.string().trim().min(1).max(200)

function filteredElements(
  document: CanvasDocument,
  options: CanvasReadOptions,
) {
  if (
    options.layerId !== undefined &&
    !document.layers.some((layer) => layer.id === options.layerId)
  )
    throw new LCanvasError('The requested layer no longer exists.')
  if (
    options.areaId !== undefined &&
    options.areaId !== null &&
    !document.elements.some(
      (element) => element.id === options.areaId && element.type === 'area',
    )
  )
    throw new LCanvasError('The requested area no longer exists.')
  return document.elements.filter(
    (element) =>
      (options.layerId === undefined || element.layerId === options.layerId) &&
      (options.areaId === undefined || element.areaId === options.areaId),
  )
}

function page(elements: CanvasElement[], options: CanvasReadOptions) {
  const offset = options.offset ?? 0
  const limit = options.limit ?? MCP_MAX_READ_ELEMENTS
  const nextOffset = offset + limit < elements.length ? offset + limit : null
  return {
    elements: elements.slice(offset, offset + limit),
    total: elements.length,
    offset,
    limit,
    nextOffset,
  }
}

/** Reads a bounded page, with layer metadata and the active document's viewport. */
export function canvasState(
  document: CanvasDocument,
  input: CanvasReadOptions = {},
) {
  const current = validateCanvasDocument(document)
  const options = readOptionsSchema.parse(input)
  return {
    format: current.format,
    version: current.version,
    name: current.name,
    viewport: current.viewport,
    layers: current.layers,
    ...page(filteredElements(current, options), options),
  }
}

export function findShape(
  document: CanvasDocument,
  input: string,
): CanvasElement {
  const current = validateCanvasDocument(document)
  const id = identifier.parse(input)
  const element = current.elements.find((candidate) => candidate.id === id)
  if (!element)
    throw new LCanvasError('The requested canvas object no longer exists.')
  return element
}

/** Searches literal text in object IDs, types, labels, area names and assigned layer names. */
export function searchCanvas(
  document: CanvasDocument,
  input: string,
  readOptions: CanvasReadOptions = {},
) {
  const current = validateCanvasDocument(document)
  const query = searchQuerySchema.parse(input)
  const options = readOptionsSchema.parse(readOptions)
  const needle = query.toLocaleLowerCase('en-US')
  const elements = filteredElements(current, options).filter((element) => {
    const fields = [
      element.id,
      element.type,
      current.layers.find((layer) => layer.id === element.layerId)?.name ?? '',
    ]
    if ('text' in element) fields.push(element.text)
    if (element.type === 'area') fields.push(element.name)
    return fields.some((field) =>
      field.toLocaleLowerCase('en-US').includes(needle),
    )
  })
  return { query, ...page(elements, options) }
}
