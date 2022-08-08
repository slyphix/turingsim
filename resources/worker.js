"use strict";

importScripts("turingsim4.js");

const COMPUTE_TIMEOUT_MS = 5000;
const EPOCH_SIZE = 1000;
let tm = null;

addEventListener("message", (e) => {

  let worker = this;
  let msg = e.data;

  // stop command issued
  if (msg.type === "stop") {
    if (tm !== null && msg.data === true) {
      worker.postMessage(TuringControlMessage.make("interrupt", tm.serialize()));
    }
    worker.close();
  }
  if (msg.type === "start") {
    // import data
    tm = TuringMachine.deserialize(msg.data);

    function run() {
      // run actual operations
      try {
        for (let i = 0; i < EPOCH_SIZE && !tm.isHalted(); i++)
          tm.advance();
      } catch (e) {
        worker.postMessage(TuringControlMessage.make("error", e.message));
        worker.close();
      }

      // halt state reached
      if (tm.isHalted()) {
        worker.postMessage(TuringControlMessage.make("done", tm.serialize()));
        worker.close();
      }
      // taking too long
      else if (Date.now() - start > COMPUTE_TIMEOUT_MS) {
        worker.postMessage(TuringControlMessage.make("timeout", tm.serialize()));
        worker.close();
      }
      // else requeue
      else {
        worker.setTimeout(run, 0);
      }
    }
    let start = Date.now();
    setTimeout(run, 0);
  }
});
