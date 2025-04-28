import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs";

const pyodideReadyPromise = loadPyodide();

// Helper function to convert Python numeric types to JavaScript
function convertNumericType(value) {
  // Handle numpy/pandas numeric types
  if (value && typeof value === 'object' && value.toString && typeof value.toString === 'function') {
    const numValue = Number(value.toString());
    return isNaN(numValue) ? value : numValue;
  }
  return value;
}

// Helper function to convert Python result to JavaScript
function convertPyResult(value) {
  if (value === null || value === undefined) {
    return value;
  }
  
  // Handle arrays/lists
  if (Array.isArray(value)) {
    return value.map(item => convertPyResult(item));
  }
  
  // Handle objects/dicts
  if (typeof value === 'object') {
    if (value instanceof Map) {
      const obj = {};
      for (const [k, v] of value.entries()) {
        obj[k] = convertPyResult(v);
      }
      return obj;
    }
    
    const obj = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = convertPyResult(v);
    }
    return obj;
  }
  
  // Handle numeric types
  return convertNumericType(value);
}

self.onmessage = async (event) => {
  // make sure loading is done
  const pyodide = await pyodideReadyPromise;
  const { id, code, data, context } = event.data;

  // Now load any packages we need
  await pyodide.loadPackagesFromImports(code);
  
  // Change the globals() each time
  const dict = pyodide.globals.get("dict");
  const globals = dict(Object.entries(context));
  globals.set("data", pyodide.toPy(data));
  
  try {
    const resultProxy = await pyodide.runPythonAsync(code, { globals });
    const pyResult = resultProxy.toJs();
    // Convert the result handling both numeric values and objects
    const result = convertPyResult(pyResult);
    self.postMessage({ id, result });
  } catch (e) {
    console.error("Python execution error:", e);
    self.postMessage({ id, error: e.message });
  } finally {
    if (globals) {
      globals.destroy();
    }
  }
};
