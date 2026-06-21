import { computeGridWithMessages } from "./gridCompute";
import { type GridComputeRequest, type GridWorkerMessage } from "./grid";

type IncomingWorkerMessage =
  | { type: "compute-grid"; request: GridComputeRequest }
  | { type: "cancel-grid"; requestId?: number };

let activeToken = 0;

self.onmessage = (event: MessageEvent<IncomingWorkerMessage>) => {
  const message = event.data;
  if (message.type === "cancel-grid") {
    activeToken += 1;
    if (message.requestId !== undefined) post({ type: "grid-canceled", requestId: message.requestId });
    return;
  }
  if (message.type === "compute-grid") {
    const token = activeToken + 1;
    activeToken = token;
    void computeGridWithMessages(message.request, {
      post,
      isCanceled: () => token !== activeToken
    });
  }
};

function post(message: GridWorkerMessage): void {
  self.postMessage(message);
}
