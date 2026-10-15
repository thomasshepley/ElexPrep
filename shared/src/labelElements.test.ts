import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABEL_TEMPLATES, mergeTemplate, resolveLabelContent } from './labelElements';

test('resolveLabelContent: FIXTURE stacks only the info lines that have data, in a fixed order', () => {
  const full = resolveLabelContent('FIXTURE', {
    address: 201,
    mainUniverse: 1,
    mainAddress: 1,
    pixUniverse: 2,
    pixAddress: 50,
    mode: 'Extended',
  });
  assert.equal(full.address, '201');
  assert.deepEqual(full.infoLines, ['Main: Uni: 1 Add: 1', 'Pix: Uni: 2 Add: 50', 'Mode: Extended']);

  const partial = resolveLabelContent('FIXTURE', { address: 202, mainUniverse: 1, mainAddress: 37 });
  assert.deepEqual(partial.infoLines, ['Main: Uni: 1 Add: 37']);

  const bare = resolveLabelContent('FIXTURE', { address: 203 });
  assert.deepEqual(bare.infoLines, []);

  // Pix-only (no Main) still renders, as its own single line - order follows presence, not
  // which specific field happened to be set.
  const pixOnly = resolveLabelContent('FIXTURE', { address: 204, pixUniverse: 3, pixAddress: 9 });
  assert.deepEqual(pixOnly.infoLines, ['Pix: Uni: 3 Add: 9']);
});

test('resolveLabelContent: TRUSS_SPIKE_TIP falls back to "DO NOT TIP" when no text is set', () => {
  assert.equal(resolveLabelContent('TRUSS_SPIKE_TIP', {}).text, 'DO NOT TIP');
  assert.equal(resolveLabelContent('TRUSS_SPIKE_TIP', { text: 'HEAVY' }).text, 'HEAVY');
});

test('resolveLabelContent: TRUSS_SPIKE_SACN defaults the subnet mask when absent', () => {
  const withMask = resolveLabelContent('TRUSS_SPIKE_SACN', { ipAddress: '10.0.1.5', subnetMask: '255.255.0.0' });
  assert.equal(withMask.ipLine, 'IP Address: 10.0.1.5');
  assert.equal(withMask.subnetLine, 'Subnet Mask: 255.255.0.0');

  const noMask = resolveLabelContent('TRUSS_SPIKE_SACN', { ipAddress: '10.0.1.6' });
  assert.equal(noMask.subnetLine, 'Subnet Mask: 255.0.0.0');
});

test('resolveLabelContent: RACK and PAL pass title/subtitle through, subtitle left undefined when absent', () => {
  const rack = resolveLabelContent('RACK', { title: 'Dimmer Rack 1' });
  assert.equal(rack.title, 'Dimmer Rack 1');
  assert.equal(rack.subtitle, undefined);

  const pal = resolveLabelContent('PAL', { title: 'AstraBlade Case A', subtitle: '201 - 204' });
  assert.equal(pal.title, 'AstraBlade Case A');
  assert.equal(pal.subtitle, '201 - 204');
  assert.equal(pal.location, '');
});

test('every default template element has a unique id within its template', () => {
  for (const template of Object.values(DEFAULT_LABEL_TEMPLATES)) {
    const ids = template.elements.map((el) => el.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate element id in ${template.labelType}`);
  }
});

test('mergeTemplate: patches only the targeted element, by id, leaving everything else untouched', () => {
  const base = DEFAULT_LABEL_TEMPLATES.RACK;
  const merged = mergeTemplate(base, { title: { size: 40, x: 0.5 } });
  const mergedTitle = merged.elements.find((el) => el.id === 'title');
  const baseTitle = base.elements.find((el) => el.id === 'title');
  assert.equal(mergedTitle?.size, 40);
  assert.equal(mergedTitle?.x, 0.5);
  // Untouched fields on the patched element survive.
  assert.equal(mergedTitle?.y, baseTitle?.y);
  // Unrelated elements are returned as the exact same objects (not just equal).
  const mergedFill = merged.elements.find((el) => el.id === 'fill');
  const baseFill = base.elements.find((el) => el.id === 'fill');
  assert.equal(mergedFill, baseFill);
});

test('mergeTemplate: an override for an element id the template no longer has is simply ignored', () => {
  const base = DEFAULT_LABEL_TEMPLATES.CABLE;
  const merged = mergeTemplate(base, { nonexistentElement: { size: 99 } });
  assert.deepEqual(merged.elements, base.elements);
});

test('mergeTemplate: no overrides (or empty object) returns the base template untouched', () => {
  const base = DEFAULT_LABEL_TEMPLATES.PAL;
  assert.equal(mergeTemplate(base, undefined), base);
  assert.equal(mergeTemplate(base, null), base);
  assert.equal(mergeTemplate(base, {}), base);
});
