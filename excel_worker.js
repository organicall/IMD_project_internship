/*
  Excel parsing Web Worker
  - Parses the first sheet of a provided ArrayBuffer using SheetJS
  - Returns JSON rows with sane defaults (defval: null, raw: false)
*/

/* eslint-disable no-undef */
try {
  // Load SheetJS inside the worker
  // Using the same version as referenced in full.html
  self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
} catch (err) {
  // If import fails, we will report error on first message
}

self.onmessage = (event) => {
  try {
    const data = event.data || {};
    if (data.type !== 'parse' || !data.arrayBuffer) {
      self.postMessage({ ok: false, error: 'Invalid message to worker' });
      return;
    }

    if (typeof XLSX === 'undefined') {
      self.postMessage({ ok: false, error: 'XLSX not available in worker' });
      return;
    }

    const workbook = XLSX.read(data.arrayBuffer, {
      type: 'array',
      cellDates: true,
      dateNF: 'mm/dd/yyyy',
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: false,
    });

    self.postMessage({ ok: true, rows });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error) });
  }
};



