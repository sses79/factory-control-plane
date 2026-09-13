import { describe, expect, it } from 'vitest';

import { CONTROL_PLANE_PLACEHOLDER, placeholder } from './placeholder.js';

describe('placeholder', () => {
  it('returns the repository identifier', () => {
    expect(placeholder()).toBe(CONTROL_PLANE_PLACEHOLDER);
  });
});
