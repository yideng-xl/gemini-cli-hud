import { describe, it, expect, beforeEach } from 'vitest';
import { Interceptor } from './interceptor';

describe('Interceptor', () => {
  let interceptor: Interceptor;

  beforeEach(() => {
    interceptor = new Interceptor();
  });

  it('should update used tokens when a token event is received', () => {
    interceptor.processEvent({ type: 'usage', usedTokens: 500, totalTokens: 32000 });
    expect(interceptor.getState().tokens.used).toBe(500);
    expect(interceptor.getState().tokens.total).toBe(32000);
  });

  it('should update tool usage count when a tool event is received', () => {
    interceptor.processEvent({ type: 'tool', toolName: 'Bash' });
    interceptor.processEvent({ type: 'tool', toolName: 'Bash' });
    interceptor.processEvent({ type: 'tool', toolName: 'Read' });
    
    expect(interceptor.getState().tools.get('Bash')).toBe(2);
    expect(interceptor.getState().tools.get('Read')).toBe(1);
  });
});
