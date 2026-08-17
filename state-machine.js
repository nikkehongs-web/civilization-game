export class StateMachine {
  constructor(initial = 'IDLE') {
    this.state = initial;
    this.previous = null;
    this.changedAt = performance.now();
  }

  is(state) {
    return this.state === state;
  }

  set(next) {
    if (!next || next === this.state) return false;
    this.previous = this.state;
    this.state = next;
    this.changedAt = performance.now();
    return true;
  }

  elapsed(now = performance.now()) {
    return Math.max(0, now - this.changedAt);
  }
}
