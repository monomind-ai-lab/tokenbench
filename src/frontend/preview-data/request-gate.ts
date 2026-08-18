/** Prevents superseded or post-unmount asynchronous work from updating a page. */
export function createRequestGate() {
  let currentRequestId = 0;
  let active = true;

  return {
    begin(): number {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent(requestId: number): boolean {
      return active && currentRequestId === requestId;
    },
    dispose(): void {
      active = false;
    },
  };
}
