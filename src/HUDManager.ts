import React from 'react';
import { render, Instance } from 'ink';
import { HUD } from './components/HUD.js';
import { Interceptor, HUDState } from './interceptor.js';

interface HUDOptions {
  model: string;
  workspace: string;
}

export class HUDManager {
  private interceptor: Interceptor;
  private inkInstance: Instance | null = null;
  private options: HUDOptions;

  constructor(options: HUDOptions) {
    this.interceptor = new Interceptor();
    this.options = options;
  }

  start() {
    this.inkInstance = render(
      React.createElement(HUD, {
        state: this.interceptor.getState(),
        model: this.options.model,
        workspace: this.options.workspace
      })
    );
  }

  processEvent(event: any) {
    this.interceptor.processEvent(event);
    this.rerender();
  }

  private rerender() {
    if (this.inkInstance) {
      this.inkInstance.rerender(
        React.createElement(HUD, {
          state: this.interceptor.getState(),
          model: this.options.model,
          workspace: this.options.workspace
        })
      );
    }
  }

  getHUDState(): HUDState {
    return this.interceptor.getState();
  }

  stop() {
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
  }
}
