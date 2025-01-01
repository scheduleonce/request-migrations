// this testing utility function is used to ensure that
// a migration is called only once
import assert from "node:assert";

export const singleCallWrapper = (fn: Function, name: string) => {
  let callCount = 0;
  return async (...args: any[]) => {
    callCount++;
    assert(callCount <= 1, `${name} should be called only once`);
    return fn(...args);
  };
};
