const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const file = path.resolve(__dirname, '../src/lib/screenshot-parser.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = new Module(file, module); mod.filename = file; mod._compile(compiled, file);
const { parseScreenshotText, screenshotExpenseConfidence } = mod.exports;
const screenshot = `NOS WiFi 42\nSun 4 Oct\n23:12\nNotification Centre\nWallet Show less\nMillenniumbcp Yesterday, 14:37\nE002 Taveiro Taveiro, Centro\n€6,99\nMillenniumbcp Yesterday, 14:11\nIKEA Taveiro, Centro\n€16,07\nMillenniumbcp Yesterday, 13:50\nIKEA Taveiro, Centro\n€1,25`;
const rows = parseScreenshotText(screenshot, '2026-10-04');
assert.equal(rows.length, 3);
assert.deepEqual(rows.map(r => r.amount), [6.99, 16.07, 1.25]);
assert.deepEqual(rows.map(r => r.time), ['14:37', '14:11', '13:50']);
assert.ok(rows.every(r => r.date === '2026-10-03' && !r.dateUncertain));
assert.equal(rows[0].merchant, 'E002 Taveiro Taveiro, Centro');
assert.equal(rows[1].merchant, 'IKEA Taveiro, Centro');
const wrapped = parseScreenshotText('Millenniumbcp\nOntem, 12:05\nMy long\nmerchant name\n12,50 EUR', '2026-01-01');
assert.equal(wrapped[0].date, '2025-12-31');
assert.equal(wrapped[0].merchant, 'My long merchant name');
const unknown = parseScreenshotText('Revolut 14:20\nShop\n£1,234.56', '2026-10-04');
assert.equal(unknown[0].amount, 1234.56); assert.equal(unknown[0].currency, 'GBP'); assert.equal(unknown[0].dateUncertain, true);
assert.equal(parseScreenshotText('IKEA\n€9.99\nIKEA\n€9.99', '2026-10-04').length, 2);
assert.equal(parseScreenshotText('Battery 42\n23:12\nNo transactions', '2026-10-04').length, 0);
assert.equal(parseScreenshotText('Millenniumbcp Hier, 11:22\nBoutique\nE 6,99', '2026-10-04')[0].amount, 6.99);
assert.equal(parseScreenshotText('Bank\n2026-10-02\nShop\n$12.50', '2026-10-04')[0].date, '2026-10-02');
const dotted = parseScreenshotText('Millenniumbcp 03.10.2026, 14:37\nIKEA Taveiro\nEUR16,07', '2026-10-04')[0];
assert.equal(dotted.time, '14:37'); assert.equal(dotted.date, '2026-10-03'); assert.equal(dotted.merchant, 'IKEA Taveiro');
const footer = parseScreenshotText('Millenniumbcp\nIKEA\n€16,07\nYesterday, 14:11\nMillenniumbcp\nIKEA\n€1,25\nYesterday, 13:50', '2026-10-04');
assert.deepEqual(footer.map(r => r.time), ['14:11', '13:50']);
assert.ok(footer.every(r => r.date === '2026-10-03' && r.merchant === 'IKEA'));
const confidenceRow = parseScreenshotText('Millenniumbcp\nIKEA\n€16,07', '2026-10-04')[0];
const scoredLines = [{text:'Wallpaper noise',words:[{text:'noise',confidence:5}]},{text:'Millenniumbcp',words:[{text:'Millenniumbcp',confidence:30}]},{text:'IKEA',words:[{text:'IKEA',confidence:95}]},{text:'€16,07',words:[{text:'€16,07',confidence:94}]}];
assert.equal(screenshotExpenseConfidence(confidenceRow, scoredLines), 85);
scoredLines[3].words[0].confidence = 35;
assert.equal(screenshotExpenseConfidence(confidenceRow, scoredLines), 35);
console.log('Screenshot parser regression checks passed');
if (process.argv[2]) {
  require('sharp')(process.argv[2]).resize({width:1176}).grayscale().negate().png().toBuffer().then(async buffer => {
    const worker = await require('tesseract.js').createWorker('eng+por', 1, {cachePath: require('node:os').tmpdir()});
    try { return await worker.recognize(buffer, {}, {text:true, blocks:true}); } finally { await worker.terminate(); }
  }).then(result => {
    const actual = parseScreenshotText(result.data.text, '2026-10-04');
    console.log('OCR text:', result.data.text);
    console.log('Extracted:', JSON.stringify(actual, null, 2));
    assert.deepEqual(actual.map(r => r.amount), [6.99, 16.07, 1.25]);
    assert.equal(actual[0].merchant, 'E002 Taveiro Taveiro, Centro');
    assert.equal(actual[1].merchant, 'IKEA Taveiro, Centro');
    assert.equal(actual[2].merchant, 'IKEA Taveiro, Centro');
    assert.ok(actual.every(r => r.date === '2026-10-03'));
    const lines = (result.data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines));
    console.log('Expense confidence:', actual.map(r => screenshotExpenseConfidence(r, lines)));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
