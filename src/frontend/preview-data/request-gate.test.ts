import { describe, expect, it } from 'vitest';
import { createRequestGate } from './request-gate';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('request gate', () => {
  it('does not authorize a calculation result after its page has unmounted', async () => {
    const gate = createRequestGate();
    const requestId = gate.begin();
    const calculation = deferred<string>();
    const accepted: string[] = [];
    void calculation.promise.then((result) => {
      if (gate.isCurrent(requestId)) accepted.push(result);
    });

    gate.dispose();
    calculation.resolve('late calculation');
    await calculation.promise;

    expect(accepted).toEqual([]);
  });
});
