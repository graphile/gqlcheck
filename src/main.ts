import { resolvePresets } from "graphile-config";
import { Worker } from "node:worker_threads";
import * as os from "node:os";
import {
  CheckDocumentRequest,
  CheckDocumentResult,
  WorkerData,
  Issue,
  SourceLike,
} from "./interfaces";
import { loadConfig } from "graphile-config/load";
import debugFactory from "debug";

const debug = debugFactory("opcheck");

type Deferred<T> = Promise<T> & {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

function defer<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  return Object.assign(
    new Promise<T>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    }),
    { resolve, reject },
  );
}

export async function checkOperations(
  getDocuments: () => AsyncIterable<string | SourceLike>,
  configPath?: string,
) {
  const rawConfig = await loadConfig(configPath);
  const config = rawConfig ? resolvePresets([rawConfig]) : {};
  const { opcheck: { workerCount = os.cpus().length } = {} } = config;
  const workerPromises: Promise<Worker>[] = [];
  const handleError = (_worker: Worker, error: Error) => {
    console.error(`Worker exited with error: ${error}`);
    process.exit(2);
  };
  for (let i = 0; i < workerCount; i++) {
    const deferred = defer<Worker>();
    const workerNumber = i;
    const worker = new Worker(`${__dirname}/worker.js`, {
      workerData: {
        configPath,
      } as WorkerData,
    });
    worker.on("error", (error) => {
      worker.terminate();
      handleError(worker, error);
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        handleError(
          worker,
          new Error(`Worker ${workerNumber} stopped with exit code ${code}`),
        );
      }
    });
    workerPromises[i] = deferred;
    worker.once("message", (msg) => {
      if (msg === "READY") {
        deferred.resolve(worker);
      } else {
        console.error(`Received unexpected response: %O`, msg);
        process.exit(3);
      }
    });
  }

  const workers = await Promise.all(workerPromises);

  const freeWorkers = [...workers];
  const queue: Deferred<Worker>[] = [];
  let workersActive = true;

  function releaseWorker(worker: Worker) {
    workers.splice(workers.indexOf(worker), 1);
    worker.postMessage("STOP");
  }

  function _getFreeWorker() {
    const worker = freeWorkers.pop();
    if (worker) {
      return worker;
    } else {
      const promise = defer<Worker>();
      queue.push(promise);
      return promise;
    }
  }

  function _returnWorker(worker: Worker) {
    const waiting = queue.pop();
    if (waiting) {
      waiting.resolve(worker);
    } else if (!workersActive) {
      releaseWorker(worker);
    } else {
      freeWorkers.push(worker);
    }
  }

  function releaseWorkers() {
    workersActive = false;
    const workersToRelease = freeWorkers.splice(0, freeWorkers.length);
    for (const worker of workersToRelease) {
      releaseWorker(worker);
    }
  }

  interface Task<TRequest, TResult> {
    request: TRequest;
    resultPromise: Promise<TResult>;
  }

  async function startWorkerTask<TRequest, TResult>(
    request: TRequest,
  ): Promise<Task<TRequest, TResult>> {
    const resultPromise = defer<TResult>();
    const worker = await _getFreeWorker();
    const handleResponse = (message: any) => {
      worker.off("message", handleResponse);
      _returnWorker(worker);
      resultPromise.resolve(message);
    };
    worker.on("message", handleResponse);
    worker.postMessage(request);
    return { request, resultPromise };
  }

  const results: Record<
    string,
    {
      sourceString: string;
      result: CheckDocumentResult;
    }
  > = Object.create(null);

  const startedTasks: Task<CheckDocumentRequest, CheckDocumentResult>[] = [];
  let index = -1;
  const sourceNames = new Set<string>();

  // In this loop the `await` is just for _starting_ a task, this gives us flow
  // control (so we don't request more data than we have workers to handle, but
  // we still make sure that all workers are busy). This is why we push a
  // promise onto the list.
  for await (const source of getDocuments()) {
    index++;
    const sourceName = typeof source === "string" ? String(index) : source.name;
    if (sourceNames.has(sourceName)) {
      throw new Error(
        `Source name '${sourceName}' has been used more than once, source names must be unique.`,
      );
    } else {
      sourceNames.add(sourceName);
    }
    const sourceString = typeof source === "string" ? source : source.body;
    const task = await startWorkerTask<
      CheckDocumentRequest,
      CheckDocumentResult
    >({
      sourceName,
      sourceString,
    });
    startedTasks.push(task);
  }

  // Now that all the tasks have been started, we wait for them all to
  // complete.
  const allResults: Array<{
    request: CheckDocumentRequest;
    result: CheckDocumentResult;
  }> = [];
  for (const task of startedTasks) {
    const request = task.request;
    const result = await task.resultPromise;
    allResults.push({ request, result });
  }

  const resultsByOperationName: {
    [operationName: string]: {
      operationName: string;
      operationKind: string;
      issues: Issue[];
    };
  } = Object.create(null);
  const failed: Array<{
    request: CheckDocumentRequest;
    result: CheckDocumentResult;
  }> = [];

  for (const { request, result } of allResults) {
    const { sourceName, sourceString } = request;
    const { errors, operations } = result;
    for (const operation of operations) {
      const { operationName = "(anon)", operationKind, issues } = operation;
      debug(`%s: %s %s`, sourceName, operationKind, operationName);
      let operationResult = resultsByOperationName[operationName];
      if (!operationResult) {
        operationResult = {
          operationName,
          operationKind,
          issues: [...issues],
        };
        resultsByOperationName[operationName] = operationResult;
      } else if (operationResult.operationKind !== operationKind) {
        throw new Error(
          `Named operation '${operationName}' previously existed with operation type '${operationResult.operationKind}', but another operation with the same name now has type '${operationKind}'. This is forbidden.`,
        );
      } else {
        operationResult.issues.push(...issues);
      }
    }
    results[sourceName] = {
      sourceString,
      result,
    };
    if (errors.length) {
      failed.push({ request, result });
    }
  }

  releaseWorkers();

  return {
    resultsByOperationName,
  };

  /*
  const MAX_DEPTH = 10;
  const MAX_LIST_DEPTH = 3;
  for (const [operationName, results] of Object.entries(
    resultsByOperationName,
  )) {
    const overrides = Object.create(null) as {
      maxDepth?: number;
      maxListDepth?: number;
    };
    if (results.maxDepth > MAX_DEPTH) {
      overrides.maxDepth = results.maxDepth;
    }
    if (results.maxListDepth > MAX_LIST_DEPTH) {
      overrides.maxListDepth = results.maxListDepth;
    }
    if (Object.keys(overrides).length > 0) {
      console.log(`${operationName}: ${JSON.stringify(overrides)}`);
    }
  }

  if (failed.length > 0) {
    console.error("The following queries failed:");
    for (const { request, result } of failed) {
      console.error(`- ${request.sourceName} (${result.operationName}):`);
      for (const error of result.errors) {
        console.error(`  ` + String(error).replace(/\n/g, "\n  "));
      }
    }
    process.exitCode = 3;
  }
  */
}
