/** Human names for label-type enums wherever they're shown as headings or table cells. */
const LABEL_TYPE_NAMES: Record<string, string> = {
  FIXTURE: 'Fixture labels',
  PAL: 'PAL case labels',
  TRUSS_SPIKE_POSITION: 'Truss spike - position',
  TRUSS_SPIKE_TIP: 'Truss spike - do not tip',
  TRUSS_SPIKE_SACN: 'Truss spike - sACN',
  CABLE: 'Cable labels',
  RACK: 'Rack labels',
};

export function labelTypeName(type: string): string {
  return LABEL_TYPE_NAMES[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
