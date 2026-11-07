import type { Dataset } from '@/api/types'

/**
 * Dataset catalog served by the MSW mock, mirroring what backend/config/datasets/*.yaml
 * will define (docs/data-layer.md#datasets). Each dataset maps onto one endpoint of the
 * local mock data API (docs/mock-data-api.md).
 */
export interface MockDataset extends Dataset {
  request: {
    /** Path on the mock data API. */
    path: string
    /** Param name → upstream query parameter name (defaults to the param name). */
    apiNames?: Record<string, string>
    /** Fixed upstream query parameters. */
    fixed?: Record<string, string>
  }
}

const TIME_PARAMS = [
  {
    name: 'start',
    label: 'From',
    type: 'datetime',
    required: true,
    filter: 'time_range.start',
    valuesFrom: null,
    default: '-7d',
  },
  {
    name: 'end',
    label: 'To',
    type: 'datetime',
    required: true,
    filter: 'time_range.end',
    valuesFrom: null,
    default: 'now',
  },
] as const satisfies Dataset['params']

export const MOCK_DATASETS: MockDataset[] = [
  {
    id: 'spc_points',
    label: 'SPC points',
    category: 'SPC',
    description: 'Metrology measurements per tool and parameter, with control and spec limits.',
    params: [
      {
        name: 'parameter',
        label: 'Parameter',
        type: 'string',
        required: true,
        filter: null,
        valuesFrom: { dataset: 'spc_parameters', column: 'parameter' },
        default: 'CD_MEAN',
      },
      {
        name: 'tool',
        label: 'Tools',
        type: 'string[]',
        required: false,
        filter: 'tool_id',
        valuesFrom: { dataset: 'tool_list', column: 'tool_id' },
      },
      ...TIME_PARAMS,
      {
        name: 'lot',
        label: 'Lots',
        type: 'string[]',
        required: false,
        filter: 'lot_id',
        valuesFrom: null,
      },
      {
        name: 'level',
        label: 'Level',
        type: 'enum',
        required: true,
        filter: null,
        valuesFrom: null,
        values: ['wafer', 'site'],
        default: 'wafer',
      },
    ],
    columns: [
      { name: 'ts', type: 'datetime', label: 'Time' },
      { name: 'value', type: 'float', label: 'Value' },
      { name: 'target', type: 'float', label: 'Target' },
      { name: 'ucl', type: 'float', label: 'UCL' },
      { name: 'lcl', type: 'float', label: 'LCL' },
      { name: 'usl', type: 'float', label: 'USL' },
      { name: 'lsl', type: 'float', label: 'LSL' },
      { name: 'parameter', type: 'string', label: 'Parameter' },
      { name: 'unit', type: 'string', label: 'Unit' },
      { name: 'step', type: 'string', label: 'Step' },
      { name: 'tool_id', type: 'string', label: 'Tool' },
      { name: 'chamber', type: 'string', label: 'Chamber' },
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'lot_id', type: 'string', label: 'Lot' },
      { name: 'wafer_id', type: 'string', label: 'Wafer' },
      { name: 'slot', type: 'int', label: 'Slot' },
      { name: 'site', type: 'int', label: 'Site' },
    ],
    tooltip: ['lot_id', 'wafer_id', 'tool_id', 'chamber'],
    suits: ['chart', 'table', 'data-preview'],
    request: {
      path: '/spc/points',
      apiNames: { tool: 'tool_ids', lot: 'lot_ids' },
    },
  },
  {
    id: 'lots',
    label: 'Lots',
    category: 'Lots',
    description: 'Lots released in a time window, with status, route tools and yield.',
    params: [
      ...TIME_PARAMS,
      {
        name: 'tool',
        label: 'Ran on tools',
        type: 'string[]',
        required: false,
        filter: 'tool_id',
        valuesFrom: { dataset: 'tool_list', column: 'tool_id' },
      },
      {
        name: 'product',
        label: 'Products',
        type: 'string[]',
        required: false,
        filter: 'product',
        valuesFrom: { dataset: 'product_list', column: 'product' },
      },
      {
        name: 'status',
        label: 'Status',
        type: 'string[]',
        required: false,
        filter: null,
        valuesFrom: null,
        values: ['QUEUED', 'ACTIVE', 'HOLD', 'COMPLETE'],
      },
    ],
    columns: [
      { name: 'lot_id', type: 'string', label: 'Lot' },
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'release_ts', type: 'datetime', label: 'Released' },
      { name: 'status', type: 'string', label: 'Status' },
      { name: 'current_step', type: 'string', label: 'Current step' },
      { name: 'current_tool', type: 'string', label: 'Current tool' },
      { name: 'wafer_count', type: 'int', label: 'Wafers' },
      { name: 'priority', type: 'int', label: 'Priority' },
      { name: 'yield_pct', type: 'float', label: 'Yield %' },
      { name: 'diff_tool', type: 'string', label: 'Diff tool' },
      { name: 'cvd_tool', type: 'string', label: 'CVD tool' },
      { name: 'litho_tool', type: 'string', label: 'Litho tool' },
      { name: 'etch_tool', type: 'string', label: 'Etch tool' },
      { name: 'cmp_tool', type: 'string', label: 'CMP tool' },
      { name: 'test_tool', type: 'string', label: 'Test tool' },
    ],
    tooltip: ['lot_id', 'product', 'status'],
    suits: ['table', 'chart', 'data-preview'],
    request: {
      path: '/lots',
      apiNames: { tool: 'tool_ids', product: 'products' },
      fixed: { limit: '10000' },
    },
  },
  {
    id: 'lot_history',
    label: 'Lot route history',
    category: 'Lots',
    description: 'Step-by-step route history (tool, chambers, track-in/out) for lots.',
    params: [
      {
        name: 'lot',
        label: 'Lots',
        type: 'string[]',
        required: true,
        filter: 'lot_id',
        valuesFrom: null,
      },
    ],
    columns: [
      { name: 'lot_id', type: 'string', label: 'Lot' },
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'step', type: 'string', label: 'Step' },
      { name: 'area', type: 'string', label: 'Area' },
      { name: 'tool_id', type: 'string', label: 'Tool' },
      { name: 'chambers', type: 'string', label: 'Chambers' },
      { name: 'track_in', type: 'datetime', label: 'Track in' },
      { name: 'track_out', type: 'datetime', label: 'Track out' },
      { name: 'status', type: 'string', label: 'Status' },
      { name: 'wafer_count', type: 'int', label: 'Wafers' },
    ],
    tooltip: ['lot_id', 'step', 'tool_id'],
    suits: ['table', 'data-preview'],
    request: { path: '/lots/history', apiNames: { lot: 'lot_ids' } },
  },
  {
    id: 'wafers',
    label: 'Wafers',
    category: 'Wafers',
    description: 'Wafers of lots with their etch tool/chamber and test status.',
    params: [
      {
        name: 'lot',
        label: 'Lots',
        type: 'string[]',
        required: true,
        filter: 'lot_id',
        valuesFrom: null,
      },
    ],
    columns: [
      { name: 'lot_id', type: 'string', label: 'Lot' },
      { name: 'wafer_id', type: 'string', label: 'Wafer' },
      { name: 'slot', type: 'int', label: 'Slot' },
      { name: 'etch_tool', type: 'string', label: 'Etch tool' },
      { name: 'etch_chamber', type: 'string', label: 'Etch chamber' },
      { name: 'etch_ts', type: 'datetime', label: 'Etched' },
      { name: 'tested', type: 'bool', label: 'Tested' },
      { name: 'test_ts', type: 'datetime', label: 'Tested at' },
    ],
    tooltip: ['wafer_id', 'etch_chamber'],
    suits: ['table', 'data-preview'],
    request: { path: '/wafers', apiNames: { lot: 'lot_ids' } },
  },
  {
    id: 'wafer_dies',
    label: 'Wafer sort (die level)',
    category: 'Wafers',
    description: 'Die-level wafer sort results (VTH, IDSAT) with x/y die coordinates.',
    params: [
      {
        name: 'parameter',
        label: 'Parameter',
        type: 'enum',
        required: true,
        filter: null,
        valuesFrom: null,
        values: ['VTH', 'IDSAT'],
        default: 'VTH',
      },
      {
        name: 'lot',
        label: 'Lots',
        type: 'string[]',
        required: false,
        filter: 'lot_id',
        valuesFrom: null,
        requiredGroup: 'target',
      },
      {
        name: 'wafer',
        label: 'Wafers',
        type: 'string[]',
        required: false,
        filter: 'wafer_id',
        valuesFrom: null,
        requiredGroup: 'target',
      },
    ],
    columns: [
      { name: 'lot_id', type: 'string', label: 'Lot' },
      { name: 'wafer_id', type: 'string', label: 'Wafer' },
      { name: 'slot', type: 'int', label: 'Slot' },
      { name: 'x', type: 'int', label: 'Die X' },
      { name: 'y', type: 'int', label: 'Die Y' },
      { name: 'parameter', type: 'string', label: 'Parameter' },
      { name: 'unit', type: 'string', label: 'Unit' },
      { name: 'value', type: 'float', label: 'Value' },
      { name: 'test_tool', type: 'string', label: 'Test tool' },
      { name: 'test_ts', type: 'datetime', label: 'Tested at' },
    ],
    tooltip: ['wafer_id', 'x', 'y', 'value'],
    suits: ['wafer-map', 'table', 'data-preview'],
    request: { path: '/wafers/dies', apiNames: { lot: 'lot_ids', wafer: 'wafer_ids' } },
  },
  {
    id: 'tool_list',
    label: 'Tools',
    category: 'Reference',
    description: 'Tools with their area, step and chambers.',
    params: [],
    columns: [
      { name: 'tool_id', type: 'string', label: 'Tool' },
      { name: 'area', type: 'string', label: 'Area' },
      { name: 'step', type: 'string', label: 'Step' },
    ],
    tooltip: [],
    suits: ['table', 'data-preview'],
    request: { path: '/tools' },
  },
  {
    id: 'spc_parameters',
    label: 'SPC parameters',
    category: 'Reference',
    description: 'Site-level metrology parameters, their step and unit.',
    params: [],
    columns: [
      { name: 'parameter', type: 'string', label: 'Parameter' },
      { name: 'description', type: 'string', label: 'Description' },
      { name: 'unit', type: 'string', label: 'Unit' },
      { name: 'step', type: 'string', label: 'Step' },
      { name: 'area', type: 'string', label: 'Area' },
      { name: 'target', type: 'float', label: 'Target' },
    ],
    tooltip: [],
    suits: ['table', 'data-preview'],
    request: { path: '/parameters', fixed: { level: 'site' } },
  },
  {
    id: 'product_list',
    label: 'Products',
    category: 'Reference',
    description: 'Products and their descriptions.',
    params: [],
    columns: [
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'description', type: 'string', label: 'Description' },
    ],
    tooltip: [],
    suits: ['table', 'data-preview'],
    request: { path: '/products' },
  },
]

export function findMockDataset(id: string): MockDataset | undefined {
  return MOCK_DATASETS.find((d) => d.id === id)
}

/** The public part of a dataset (what GET /api/datasets returns). */
export function publicDataset({ request: _request, ...dataset }: MockDataset): Dataset {
  return dataset
}
