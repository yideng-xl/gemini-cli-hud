import React from 'react';
import { render } from 'ink';
import { HUD } from './components/HUD.js';
import { Interceptor } from './interceptor.js';
export class HUDManager {
    interceptor;
    inkInstance = null;
    options;
    constructor(options) {
        this.interceptor = new Interceptor();
        this.options = options;
    }
    start() {
        this.inkInstance = render(React.createElement(HUD, {
            state: this.interceptor.getState(),
            model: this.options.model,
            workspace: this.options.workspace
        }));
    }
    processEvent(event) {
        this.interceptor.processEvent(event);
        this.rerender();
    }
    rerender() {
        if (this.inkInstance) {
            this.inkInstance.rerender(React.createElement(HUD, {
                state: this.interceptor.getState(),
                model: this.options.model,
                workspace: this.options.workspace
            }));
        }
    }
    getHUDState() {
        return this.interceptor.getState();
    }
    stop() {
        if (this.inkInstance) {
            this.inkInstance.unmount();
            this.inkInstance = null;
        }
    }
}
