// this testing utility function is used to ensure that
// a migration is called only once
import assert from "node:assert";

const callCounts = new Map<string, number>();

export const singleCallWrapper = (fn: Function, name: string) => {
  return async (...args: any[]) => {
    const currentCount = (callCounts.get(name) || 0) + 1;
    callCounts.set(name, currentCount);
    assert(currentCount <= 1, `${name} should be called only once`);
    return fn(...args);
  };
};

export const resetSingleCallWrapper = () => {
  callCounts.clear();
};
