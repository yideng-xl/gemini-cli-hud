export interface HUDState {
  tokens: {
    used: number;
    total: number;
  };
  tools: Map<string, number>;
}

export class Interceptor {
  private state: HUDState = {
    tokens: { used: 0, total: 0 },
    tools: new Map()
  };

  processEvent(event: any) {
    if (event.type === 'usage') {
      this.state.tokens.used = event.usedTokens;
      this.state.tokens.total = event.totalTokens;
    } else if (event.type === 'tool') {
      const currentCount = this.state.tools.get(event.toolName) || 0;
      this.state.tools.set(event.toolName, currentCount + 1);
    }
  }

  getState(): HUDState {
    return this.state;
  }
}
