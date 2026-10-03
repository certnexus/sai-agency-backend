const XLSX = require('xlsx')

// ════════════════════════════════════════════════════════════════════
// excelNamuna9.js
// Builds the official "नमुना 9" Grampanchayat tax register workbook:
//   1. Namuna9      — main register (मागणी + पावती क्रं + वसुली + शिल्लक कर,
//                      one row per property, starting at row 8)
//   2. Bill          — 2 Demand Bills side-by-side (Main + Carbon copy),
//                      linked to the Namuna9 sheet via INDEX/MATCH on a
//                      "Start Row / अनुक्रमांक" filter cell
//   3. summary1      — village/mohalla-wise aggregated summary
//                      (मागील + चालू + एकूण per tax head)
//   4. Bill_4Page    — 4 Demand Bills on one printable page (2x2), all
//                      driven off ONE "Start Row" filter cell and showing
//                      4 SEQUENTIAL रेकॉर्ड्स (row, row+1, row+2, row+3)
// ════════════════════════════════════════════════════════════════════

// ------------------------------------------------------------------
// Column layout (0-based) for the Namuna9 sheet — 45 columns, A..AS.
// ------------------------------------------------------------------
const COL = {
  ANUKRAMANK: 0,          // A
  NAME: 1,                // B
  WARD: 2,                // C
  PROPERTY: 3,            // D
  GHARPATTI_M: 4, GHARPATTI_C: 5, GHARPATTI_E: 6,             // E-G
  DIWABATTI_M: 7, DIWABATTI_C: 8, DIWABATTI_E: 9,             // H-J
  AROGYA_M: 10, AROGYA_C: 11, AROGYA_E: 12,                   // K-M
  PANI_SAMANYA_M: 13, PANI_SAMANYA_C: 14, PANI_SAMANYA_E: 15, // N-P
  PANI_VISHESH_M: 16, PANI_VISHESH_C: 17, PANI_VISHESH_E: 18, // Q-S
  DEMAND_TOTAL: 19,       // T  — एकूण मागणी
  PAVATI_KRAMANK: 20,     // U  — पावती क्रं
  GAP: 21,                // V  (spacer)
  V_GHARPATTI_M: 22, V_GHARPATTI_C: 23, V_GHARPATTI_E: 24,    // W-Y
  V_DIWABATTI_M: 25, V_DIWABATTI_C: 26, V_DIWABATTI_E: 27,    // Z-AB
  V_AROGYA_M: 28, V_AROGYA_C: 29, V_AROGYA_E: 30,             // AC-AE
  V_PANI_SAMANYA_M: 31, V_PANI_SAMANYA_C: 32, V_PANI_SAMANYA_E: 33, // AF-AH
  V_PANI_VISHESH_M: 34, V_PANI_VISHESH_C: 35, V_PANI_VISHESH_E: 36, // AI-AK
  RECOVERY_TOTAL: 37,     // AL — एकूण वसुली
  SHILLAK_GHARPATTI: 38,  // AM
  SHILLAK_DIWABATTI: 39,  // AN
  SHILLAK_AROGYA: 40,     // AO
  SHILLAK_PANI_SAMANYA: 41, // AP
  SHILLAK_PANI_VISHESH: 42, // AQ
  SHILLAK_TOTAL: 43,      // AR — शिल्लक एकूण
  SHERA: 44,              // AS
  BHOGVATADAR: 45,        // AT — भोगवटदाराचे नांव (Bill-lookup column)
}
const TOTAL_COLS = 46 // A..AT

// Excel column letter for a 0-based column index (0 -> 'A', 19 -> 'T', 44 -> 'AS')
const colLetter = (idx0) => {
  let n = idx0 + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ------------------------------------------------------------------
// Per-record tax math — shared by the Namuna9 sheet, summary1 sheet,
// and Bill sheets' totals.
// ------------------------------------------------------------------
const computeRowTotals = (r) => {
  const magilGharPatti = Number(r.magilGharPatti) || 0
  const chaluGharPatti = Number(r.chaluGharPatti) || 0
  const magilDiwabatti = Number(r.magilDiwabatti) || 0
  const chaluDiwabatti = Number(r.chaluDiwabatti) || 0
  const magilArogya = Number(r.magilArogya) || 0
  const chaluArogya = Number(r.chaluArogya) || 0
  const magilPanipattiSamanya = Number(r.magilPanipattiSamanya) || 0
  const chaluPanipattiSamanya = Number(r.chaluPanipattiSamanya) || 0
  const magilPanipattiVishesh = Number(r.magilPanipattiVishesh) || 0
  const chaluPanipattiVishesh = Number(r.chaluPanipattiVishesh) || 0

  const ekunGharPatti = magilGharPatti + chaluGharPatti
  const ekunDiwabatti = magilDiwabatti + chaluDiwabatti
  const ekunArogya = magilArogya + chaluArogya
  const ekunPanipattiSamanya = magilPanipattiSamanya + chaluPanipattiSamanya
  const ekunPanipattiVishesh = magilPanipattiVishesh + chaluPanipattiVishesh
  const demandTotal = ekunGharPatti + ekunDiwabatti + ekunArogya + ekunPanipattiSamanya + ekunPanipattiVishesh

  const magilGharPattiV = Number(r.magilGharPattiVasuli) || 0
  const chaluGharPattiV = Number(r.chaluGharPattiVasuli) || 0
  const magilDiwabattiV = Number(r.magilDiwabattiVasuli) || 0
  const chaluDiwabattiV = Number(r.chaluDiwabattiVasuli) || 0
  const magilArogyaV = Number(r.magilArogyaVasuli) || 0
  const chaluArogyaV = Number(r.chaluArogyaVasuli) || 0
  // NOTE: the model stores a single पाणीपट्टी वसुली pair (no सामान्य/विशेष
  // split on the recovery side) — applied against सामान्य पाणी कर first,
  // matching how the on-screen Namuna 9 table treats वसुली.
  const magilPaniV = Number(r.magilPanipattiVasuli) || 0
  const chaluPaniV = Number(r.chaluPanipattiVasuli) || 0

  const ekunGharPattiV = magilGharPattiV + chaluGharPattiV
  const ekunDiwabattiV = magilDiwabattiV + chaluDiwabattiV
  const ekunArogyaV = magilArogyaV + chaluArogyaV
  const ekunPaniSamanyaV = magilPaniV + chaluPaniV
  const ekunPaniVisheshV = 0
  const recoveryTotal = ekunGharPattiV + ekunDiwabattiV + ekunArogyaV + ekunPaniSamanyaV + ekunPaniVisheshV

  const shillakGharPatti = Math.max(0, ekunGharPatti - ekunGharPattiV)
  const shillakDiwabatti = Math.max(0, ekunDiwabatti - ekunDiwabattiV)
  const shillakArogya = Math.max(0, ekunArogya - ekunArogyaV)
  const shillakPaniSamanya = Math.max(0, ekunPanipattiSamanya - ekunPaniSamanyaV)
  const shillakPaniVishesh = Math.max(0, ekunPanipattiVishesh - ekunPaniVisheshV)
  const shillakTotal = shillakGharPatti + shillakDiwabatti + shillakArogya + shillakPaniSamanya + shillakPaniVishesh

  return {
    magilGharPatti, chaluGharPatti, ekunGharPatti,
    magilDiwabatti, chaluDiwabatti, ekunDiwabatti,
    magilArogya, chaluArogya, ekunArogya,
    magilPanipattiSamanya, chaluPanipattiSamanya, ekunPanipattiSamanya,
    magilPanipattiVishesh, chaluPanipattiVishesh, ekunPanipattiVishesh,
    demandTotal,
    magilGharPattiV, chaluGharPattiV, ekunGharPattiV,
    magilDiwabattiV, chaluDiwabattiV, ekunDiwabattiV,
    magilArogyaV, chaluArogyaV, ekunArogyaV,
    magilPaniV, chaluPaniV, ekunPaniSamanyaV, ekunPaniVisheshV,
    recoveryTotal,
    shillakGharPatti, shillakDiwabatti, shillakArogya,
    shillakPaniSamanya, shillakPaniVishesh, shillakTotal,
  }
}

// Builds one 45-cell data row (array, column order === COL map) for a
// single Namuna9 record.
const buildDataRow = (r) => {
  const t = computeRowTotals(r)
  const row = new Array(TOTAL_COLS).fill('')
  row[COL.ANUKRAMANK] = r.anukramank || ''
  row[COL.NAME] = r.gharMalakName || ''
  row[COL.WARD] = r.wardKramank || ''
  row[COL.PROPERTY] = r.malmattaKramank || ''

  row[COL.GHARPATTI_M] = t.magilGharPatti
  row[COL.GHARPATTI_C] = t.chaluGharPatti
  row[COL.GHARPATTI_E] = t.ekunGharPatti
  row[COL.DIWABATTI_M] = t.magilDiwabatti
  row[COL.DIWABATTI_C] = t.chaluDiwabatti
  row[COL.DIWABATTI_E] = t.ekunDiwabatti
  row[COL.AROGYA_M] = t.magilArogya
  row[COL.AROGYA_C] = t.chaluArogya
  row[COL.AROGYA_E] = t.ekunArogya
  row[COL.PANI_SAMANYA_M] = t.magilPanipattiSamanya
  row[COL.PANI_SAMANYA_C] = t.chaluPanipattiSamanya
  row[COL.PANI_SAMANYA_E] = t.ekunPanipattiSamanya
  row[COL.PANI_VISHESH_M] = t.magilPanipattiVishesh
  row[COL.PANI_VISHESH_C] = t.chaluPanipattiVishesh
  row[COL.PANI_VISHESH_E] = t.ekunPanipattiVishesh
  row[COL.DEMAND_TOTAL] = t.demandTotal

  // ✅ पावती क्रं — falls back to अनुक्रमांक when a record has no explicit
  // receipt number saved yet (matches the "पावती क्रमांक follows अनुक्रमांक"
  // rule from the uniqueness requirement).
  row[COL.PAVATI_KRAMANK] = r.pavatiKramank || r.anukramank || ''

  row[COL.V_GHARPATTI_M] = t.magilGharPattiV
  row[COL.V_GHARPATTI_C] = t.chaluGharPattiV
  row[COL.V_GHARPATTI_E] = t.ekunGharPattiV
  row[COL.V_DIWABATTI_M] = t.magilDiwabattiV
  row[COL.V_DIWABATTI_C] = t.chaluDiwabattiV
  row[COL.V_DIWABATTI_E] = t.ekunDiwabattiV
  row[COL.V_AROGYA_M] = t.magilArogyaV
  row[COL.V_AROGYA_C] = t.chaluArogyaV
  row[COL.V_AROGYA_E] = t.ekunArogyaV
  row[COL.V_PANI_SAMANYA_M] = t.magilPaniV
  row[COL.V_PANI_SAMANYA_C] = t.chaluPaniV
  row[COL.V_PANI_SAMANYA_E] = t.ekunPaniSamanyaV
  row[COL.V_PANI_VISHESH_M] = 0
  row[COL.V_PANI_VISHESH_C] = 0
  row[COL.V_PANI_VISHESH_E] = t.ekunPaniVisheshV
  row[COL.RECOVERY_TOTAL] = t.recoveryTotal

  row[COL.SHILLAK_GHARPATTI] = t.shillakGharPatti
  row[COL.SHILLAK_DIWABATTI] = t.shillakDiwabatti
  row[COL.SHILLAK_AROGYA] = t.shillakArogya
  row[COL.SHILLAK_PANI_SAMANYA] = t.shillakPaniSamanya
  row[COL.SHILLAK_PANI_VISHESH] = t.shillakPaniVishesh
  row[COL.SHILLAK_TOTAL] = t.shillakTotal

  row[COL.SHERA] = r.shera || ''
  row[COL.BHOGVATADAR] = r.bhogvatadarName || ''
  return row
}

// Sums a set of already-built 45-cell data rows into one Grand-Total row.
const buildTotalRow = (dataRows, label) => {
  const row = new Array(TOTAL_COLS).fill('')
  row[COL.ANUKRAMANK] = label || 'एकूण (Grand Total)'
  const skip = new Set([COL.ANUKRAMANK, COL.NAME, COL.WARD, COL.PROPERTY, COL.PAVATI_KRAMANK, COL.GAP, COL.SHERA, COL.BHOGVATADAR])
  Object.values(COL).forEach((c) => {
    if (skip.has(c)) return
    row[c] = dataRows.reduce((sum, r) => sum + (Number(r[c]) || 0), 0)
  })
  return row
}

// ------------------------------------------------------------------
// SHEET 1 — Namuna9 (main register)
// ------------------------------------------------------------------
const buildNamuna9Sheet = (records, meta) => {
  const aoa = []
  const merges = []

  // Row 1-3: title block
  aoa.push([`ग्रामपंचायत कार्यालय ${meta.panchayat || ''}`])
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: TOTAL_COLS - 1 } })

  aoa.push([
    `सन ${meta.previousYear || ''} ते ${meta.currentYear || ''} या सालासाठी कर आकारणी केलेल्या मागणी व वसुली चे नोंदणी पुस्तक (नमुना 9)`,
  ])
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: TOTAL_COLS - 1 } })

  aoa.push([`तालुका : ${meta.taluka || ''}     जिल्हा : ${meta.district || ''}`])
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: TOTAL_COLS - 1 } })

  // Row 4: टीप (legend) — explains the मागील/चालू/एकूण/शिल्लक abbreviations
  // used throughout the grouped header below.
  aoa.push([
    'टीप : मागील = मागील वर्षीची थकबाकी | चालू = चालू वर्षाची कर आकारणी | एकूण = मागील + चालू | ' +
    'शिल्लक (बाकी) = एकूण मागणी - एकूण वसुली | पावती क्रं = कर वसुली मागणी बिलावरील पावती क्रमांक',
  ])
  merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: TOTAL_COLS - 1 } })

  // Rows 5-7: 3-level grouped header
  const r5 = new Array(TOTAL_COLS).fill('')
  const r6 = new Array(TOTAL_COLS).fill('')
  const r7 = new Array(TOTAL_COLS).fill('')

  r5[COL.ANUKRAMANK] = 'अनुक्रमांक'
  r5[COL.NAME] = 'ज्या इसमाकडून कर घेणे असेल त्याची नावे'
  r5[COL.WARD] = 'वार्ड क्रं'
  r5[COL.PROPERTY] = 'घर / मालमत्ता क्रं'
  r5[COL.GHARPATTI_M] = 'मागणी'
  r5[COL.PAVATI_KRAMANK] = 'पावती क्रं'
  r5[COL.V_GHARPATTI_M] = 'वसुली'
  r5[COL.SHILLAK_GHARPATTI] = 'शिल्लक कर (बाकी)'
  r5[COL.SHERA] = 'शेरा / सुट मंजूर करणाऱ्या आदेशा वरून उल्लेख'
  r5[COL.BHOGVATADAR] = 'भोगवटदाराचे नांव'

  const demandGroups = [
    { label: 'इमारत कर', start: COL.GHARPATTI_M },
    { label: 'दिवा कर', start: COL.DIWABATTI_M },
    { label: 'आरोग्य कर', start: COL.AROGYA_M },
    { label: 'सामान्य पाणी कर', start: COL.PANI_SAMANYA_M },
    { label: 'विशेष पाणी कर', start: COL.PANI_VISHESH_M },
  ]
  const recoveryGroups = [
    { label: 'इमारत कर', start: COL.V_GHARPATTI_M },
    { label: 'दिवा कर', start: COL.V_DIWABATTI_M },
    { label: 'आरोग्य कर', start: COL.V_AROGYA_M },
    { label: 'सामान्य पाणी कर', start: COL.V_PANI_SAMANYA_M },
    { label: 'विशेष पाणी कर', start: COL.V_PANI_VISHESH_M },
  ]
  const shillakSingles = [
    { label: 'इमारत', col: COL.SHILLAK_GHARPATTI },
    { label: 'दिवा', col: COL.SHILLAK_DIWABATTI },
    { label: 'आरोग्य', col: COL.SHILLAK_AROGYA },
    { label: 'सामान्य पाणी', col: COL.SHILLAK_PANI_SAMANYA },
    { label: 'विशेष पाणी', col: COL.SHILLAK_PANI_VISHESH },
    { label: 'एकूण', col: COL.SHILLAK_TOTAL },
  ]

  demandGroups.forEach((g) => { r6[g.start] = g.label })
  recoveryGroups.forEach((g) => { r6[g.start] = g.label })
  r6[COL.DEMAND_TOTAL] = 'एकूण'
  r6[COL.RECOVERY_TOTAL] = 'एकूण'
  shillakSingles.forEach((s) => { r6[s.col] = s.label })
  ;[...demandGroups, ...recoveryGroups].forEach((g) => {
    r7[g.start] = 'मागील'
    r7[g.start + 1] = 'चालू'
    r7[g.start + 2] = 'एकूण'
  })

  aoa.push(r5, r6, r7)

  const HR = 4 // header row index (0-based) of "row5" in the AOA (title x3 + टीप = 4)
  // Vertical merges rows5-7 for single columns
  ;[COL.ANUKRAMANK, COL.NAME, COL.WARD, COL.PROPERTY, COL.PAVATI_KRAMANK, COL.GAP, COL.SHERA, COL.BHOGVATADAR].forEach((c) => {
    merges.push({ s: { r: HR, c }, e: { r: HR + 2, c } })
  })
  // Horizontal merges row5 for the 3 big blocks
  merges.push({ s: { r: HR, c: COL.GHARPATTI_M }, e: { r: HR, c: COL.DEMAND_TOTAL } })
  merges.push({ s: { r: HR, c: COL.V_GHARPATTI_M }, e: { r: HR, c: COL.RECOVERY_TOTAL } })
  merges.push({ s: { r: HR, c: COL.SHILLAK_GHARPATTI }, e: { r: HR, c: COL.SHILLAK_TOTAL } })
  // Row6 group-label merges (3-wide) for मागणी/वसुली tax heads
  ;[...demandGroups, ...recoveryGroups].forEach((g) => {
    merges.push({ s: { r: HR + 1, c: g.start }, e: { r: HR + 1, c: g.start + 2 } })
  })
  // Vertical merges rows6-7 for एकूण (demand/recovery total) + शिल्लक singles
  ;[COL.DEMAND_TOTAL, COL.RECOVERY_TOTAL, ...shillakSingles.map((s) => s.col)].forEach((c) => {
    merges.push({ s: { r: HR + 1, c }, e: { r: HR + 2, c } })
  })

  // Data rows — starts at Excel row 8 (0-based AOA index 7)
  const dataRows = records.map(buildDataRow)
  dataRows.forEach((row) => aoa.push(row))

  if (dataRows.length > 0) {
    aoa.push(buildTotalRow(dataRows, 'एकूण (Grand Total)'))
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = new Array(TOTAL_COLS).fill(null).map((_, c) => {
    if (c === COL.NAME || c === COL.BHOGVATADAR) return { wch: 26 }
    if (c === COL.SHERA) return { wch: 24 }
    if (c === COL.GAP) return { wch: 2 }
    if (c === COL.ANUKRAMANK || c === COL.WARD || c === COL.PROPERTY || c === COL.PAVATI_KRAMANK) return { wch: 10 }
    return { wch: 9 }
  })
  ws['!rows'] = [
    { hpt: 20 }, { hpt: 20 }, { hpt: 18 }, { hpt: 16 },
    { hpt: 18 }, { hpt: 18 }, { hpt: 16 },
  ]
  return ws
}

// ------------------------------------------------------------------
// Bill formula helpers — INDEX/MATCH against the Namuna9 sheet, so a
// Bill sheet stays "live": change the अनुक्रमांक filter cell and every
// figure on the printed bill recalculates in Excel.
// `matchIdxExpr` is the Excel expression (as a string) that resolves to
// the 1-based ROW NUMBER within the Namuna9 sheet to pull data from —
// e.g. "MATCH($B$1,Namuna9!$A:$A,0)" for a direct lookup, or
// "MATCH($B$1,Namuna9!$A:$A,0)+2" to grab the record two rows below the
// filter cell's match (used by Bill_4Page for sequential bills 3 & 4).
// ------------------------------------------------------------------
const billFormulaHelpersByIdx = (matchIdxExpr) => {
  const rawNum = (col) => `INDEX(Namuna9!${col}:${col},${matchIdxExpr})`
  // Every formula cell also carries a cached `v` (0 / '') — required for
  // SheetJS Community Edition's writer to actually serialize the cell;
  // Excel recalculates and overwrites this cached value the moment the
  // workbook is opened, so it's a placeholder, not the real answer.
  const num = (col) => ({ t: 'n', v: 0, f: `IFERROR(${rawNum(col)},0)` })
  const text = (col) => ({ t: 's', v: '', f: `IFERROR(${rawNum(col)},"")` })
  const sumNum = (...cols) => ({
    t: 'n',
    v: 0,
    f: `IFERROR(${cols.map((c) => rawNum(c)).join('+')},0)`,
  })
  return { num, text, sumNum }
}

// Builds one 4-column bill block (Main or Carbon copy) as an array of
// row-arrays, using formulas linked to `matchIdxExpr` (the Namuna9 sheet
// ROW to pull from — see billFormulaHelpersByIdx above).
const buildBillFormulaBlock = (label, matchIdxExpr, meta) => {
  const { num, text, sumNum } = billFormulaHelpersByIdx(matchIdxExpr)
  const c = (key) => colLetter(COL[key])

  return [
    [label, '', '', ''],
    ['नमुना 9 (क), (नियम 32 (5) पहा)', '', '', ''],
    ['महाराष्ट्र ग्रामपंचायत अधिनियम, कलम 129 प्रमाणे कर वसुली मागणी बिल', '', '', ''],
    [`ग्रामपंचायत कार्यालय ${meta.panchayat || ''}${meta.village ? ' (' + meta.village + ')' : ''}`, '', '', ''],
    ['मालमत्ता धारकाचे नांव', text(c('NAME')), '', ''],
    ['भोगवटदाराचे नांव', text(c('BHOGVATADAR')), '', ''],
    [
      { t: 's', v: '', f: `"वार्ड क्रं: "&${`IFERROR(${`INDEX(Namuna9!${c('WARD')}:${c('WARD')},${matchIdxExpr})`},"")`}` },
      { t: 's', v: '', f: `"घर क्रं: "&${`IFERROR(${`INDEX(Namuna9!${c('PROPERTY')}:${c('PROPERTY')},${matchIdxExpr})`},"")`}` },
      { t: 's', v: '', f: `"पावती क्रं: "&${`IFERROR(${`INDEX(Namuna9!${c('PAVATI_KRAMANK')}:${c('PAVATI_KRAMANK')},${matchIdxExpr})`},"")`}` },
      '',
    ],
    ['अनुक्रमांक', text(c('ANUKRAMANK')), 'चालू कर सन', `${meta.previousYear || ''}-${meta.currentYear || ''}`],
    ['करांची नांवे', 'मागील कर', 'चालू कर', 'एकूण कर'],
    ['इमारत कर (घरपट्टी)', num(c('GHARPATTI_M')), num(c('GHARPATTI_C')), num(c('GHARPATTI_E'))],
    ['दिवाबत्ती कर', num(c('DIWABATTI_M')), num(c('DIWABATTI_C')), num(c('DIWABATTI_E'))],
    ['आरोग्य कर', num(c('AROGYA_M')), num(c('AROGYA_C')), num(c('AROGYA_E'))],
    ['सामान्य पाणीपट्टी कर', num(c('PANI_SAMANYA_M')), num(c('PANI_SAMANYA_C')), num(c('PANI_SAMANYA_E'))],
    ['विशेष पाणीपट्टी कर', num(c('PANI_VISHESH_M')), num(c('PANI_VISHESH_C')), num(c('PANI_VISHESH_E'))],
    [
      'एकूण कर (मागणी)',
      sumNum(c('GHARPATTI_M'), c('DIWABATTI_M'), c('AROGYA_M'), c('PANI_SAMANYA_M'), c('PANI_VISHESH_M')),
      sumNum(c('GHARPATTI_C'), c('DIWABATTI_C'), c('AROGYA_C'), c('PANI_SAMANYA_C'), c('PANI_VISHESH_C')),
      num(c('DEMAND_TOTAL')),
    ],
    ['वसुली एकूण', '', '', num(c('RECOVERY_TOTAL'))],
    ['शिल्लक कर (बाकी)', '', '', num(c('SHILLAK_TOTAL'))],
    ['', '', '', ''],
    ['वरील दर्शविलेली रकमेची सुचना मिळाल्यापासून 15 दिवसाच्या आत कर भरणा करावा.', '', '', ''],
    [`दिनांक: ${new Date().toLocaleDateString('en-GB')}`, 'शिक्का', '', 'सरपंच / सचिव सही'],
  ]
}

// Converts an array-of-arrays (where cells may be plain values OR
// {t,f,v} formula descriptors) into a SheetJS aoa_to_sheet-compatible
// sheet, patching in the formula cells afterwards (aoa_to_sheet only
// understands plain values).
const materializeFormulaBlock = (rows, sheetRowOffset, sheetColOffset, ws) => {
  rows.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell && typeof cell === 'object' && 'f' in cell) {
        const addr = XLSX.utils.encode_cell({ r: sheetRowOffset + rIdx, c: sheetColOffset + cIdx })
        ws[addr] = { t: cell.t || 'n', v: 'v' in cell ? cell.v : (cell.t === 's' ? '' : 0), f: cell.f }
      }
    })
  })
}

// Plain-value view of a formula block (formula cells rendered blank
// until Excel recalculates them) — used to seed aoa_to_sheet.
const plainValuesOf = (rows) => rows.map((row) => row.map((cell) => (cell && typeof cell === 'object' && 'f' in cell ? '' : cell)))

// ------------------------------------------------------------------
// SHEET 2 — Bill (2 bills side by side: Main Copy + Carbon Copy)
// ------------------------------------------------------------------
const buildBillSheet = (records, meta) => {
  const defaultAnukramank = records[0] ? records[0].anukramank : ''
  const aoa = [
    ['Bill Filter Panel — Start Row (अनुक्रमांक):', defaultAnukramank, '', '', '', '', '', '', ''],
    ['↑ वरील (पिवळ्या) सेल मध्ये अनुक्रमांक बदलून Enter दाबा — दोन्ही पावत्या आपोआप अपडेट होतील (Namuna9 शीटशी INDEX/MATCH ने जोडलेल्या)', '', '', '', '', '', '', '', ''],
    [],
  ]

  const matchIdxExpr = 'MATCH($B$1,Namuna9!$A:$A,0)'
  const mainRows = buildBillFormulaBlock('मूळ प्रत (MAIN COPY)', matchIdxExpr, meta)
  const carbonRows = buildBillFormulaBlock('कार्बन प्रत (CARBON COPY)', matchIdxExpr, meta)

  const blockStartRow = aoa.length // 3
  mainRows.forEach((row, i) => {
    const carbon = carbonRows[i]
    aoa.push([...plainValuesOf([row])[0], '', ...plainValuesOf([carbon])[0]])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['B1'] = { t: 's', v: defaultAnukramank, s: { fill: { fgColor: { rgb: 'FFFF00' } } } }
  ws['!cols'] = [
    { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 3 },
    { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ]
  // Merge the title/header lines of each copy across their 4-col span
  const merges = [0, 1, 2, 3].flatMap((i) => [
    { s: { r: blockStartRow + i, c: 0 }, e: { r: blockStartRow + i, c: 3 } },
    { s: { r: blockStartRow + i, c: 5 }, e: { r: blockStartRow + i, c: 8 } },
  ])
  ws['!merges'] = merges

  // Patch in real formulas (INDEX/MATCH) for both copies
  materializeFormulaBlock(mainRows, blockStartRow, 0, ws)
  materializeFormulaBlock(carbonRows, blockStartRow, 5, ws)

  const lastRow = blockStartRow + mainRows.length
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 8 } })

  return { ws, lastRow }
}

// ------------------------------------------------------------------
// SHEET 4 — Bill_4Page (4 bills on one printable page, 2x2 layout).
// ONE shared "Start Row" filter cell ($B$1) drives all 4 bills — bill
// N shows the record N-1 rows below the matched filter row, so typing
// अनुक्रमांक "1" shows records 1,2,3,4 (sequential), matching the
// "बिल 1..4 दाखवते" requirement.
// ------------------------------------------------------------------
const buildBill4PageSheet = (records, meta) => {
  const defaultAnukramank = records[0] ? records[0].anukramank : ''
  const aoa = [
    ['Bill_4Page Filter Panel — Start Row (अनुक्रमांक):', defaultAnukramank, '', '', '', '', '', '', ''],
    ['↑ वरील (पिवळ्या) सेल मध्ये अनुक्रमांक बदला — पुढील 4 सलग नोंदींची बिले आपोआप दाखवली जातील', '', '', '', '', '', '', '', ''],
    [],
  ]

  const baseIdx = 'MATCH($B$1,Namuna9!$A:$A,0)'
  const idxFor = (n) => (n === 0 ? baseIdx : `${baseIdx}+${n}`)
  const blocks = {
    A: buildBillFormulaBlock('बिल 1', idxFor(0), meta),
    B: buildBillFormulaBlock('बिल 2', idxFor(1), meta),
    C: buildBillFormulaBlock('बिल 3', idxFor(2), meta),
    D: buildBillFormulaBlock('बिल 4', idxFor(3), meta),
  }

  const topRowStart = aoa.length // top pair (A left, B right)
  blocks.A.forEach((row, i) => {
    const right = blocks.B[i]
    aoa.push([...plainValuesOf([row])[0], '', ...plainValuesOf([right])[0]])
  })

  aoa.push([]) // 1-row gap between the two page-halves

  const bottomRowStart = aoa.length // bottom pair (C left, D right)
  blocks.C.forEach((row, i) => {
    const right = blocks.D[i]
    aoa.push([...plainValuesOf([row])[0], '', ...plainValuesOf([right])[0]])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['B1'] = { t: 's', v: defaultAnukramank, s: { fill: { fgColor: { rgb: 'FFFF00' } } } }
  ws['!cols'] = [
    { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 3 },
    { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
  ]

  const merges = []
  ;[0, 1, 2, 3].forEach((i) => {
    merges.push({ s: { r: topRowStart + i, c: 0 }, e: { r: topRowStart + i, c: 3 } })
    merges.push({ s: { r: topRowStart + i, c: 5 }, e: { r: topRowStart + i, c: 8 } })
    merges.push({ s: { r: bottomRowStart + i, c: 0 }, e: { r: bottomRowStart + i, c: 3 } })
    merges.push({ s: { r: bottomRowStart + i, c: 5 }, e: { r: bottomRowStart + i, c: 8 } })
  })
  ws['!merges'] = merges

  materializeFormulaBlock(blocks.A, topRowStart, 0, ws)
  materializeFormulaBlock(blocks.B, topRowStart, 5, ws)
  materializeFormulaBlock(blocks.C, bottomRowStart, 0, ws)
  materializeFormulaBlock(blocks.D, bottomRowStart, 5, ws)

  const lastRow = bottomRowStart + blocks.D.length
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 8 } })

  return { ws, lastRow }
}

// ------------------------------------------------------------------
// SHEET 3 — summary1 (village/mohalla-wise aggregated summary)
// "ग्रामपंचायत कर आकारणी - सारांश पत्रक" — मागील + चालू + एकूण per tax head.
// ------------------------------------------------------------------
const buildSummary1Sheet = (records, meta) => {
  const groups = new Map() // village -> records[]
  records.forEach((r) => {
    const key = (r.village && r.village.trim()) || meta.panchayat || 'एकूण'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  })

  const headerRow1 = [
    'गाव / मोहल्ला', 'मालमत्ता संख्या',
    'इमारत कर', '', '',
    'दिवा कर', '', '',
    'आरोग्य कर', '', '',
    'पाणीपट्टी कर', '', '',
    'एकूण मागणी', 'एकूण वसुली', 'शिल्लक (बाकी)',
  ]
  const headerRow2 = [
    '', '',
    'मागील', 'चालू', 'एकूण',
    'मागील', 'चालू', 'एकूण',
    'मागील', 'चालू', 'एकूण',
    'मागील', 'चालू', 'एकूण',
    '', '', '',
  ]
  const NUM_COLS = headerRow1.length

  const aoa = []
  aoa.push([`ग्रामपंचायत कार्यालय ${meta.panchayat || ''}`])
  aoa.push(['ग्रामपंचायत कर आकारणी - सारांश पत्रक (summary1)'])
  aoa.push([`सन ${meta.previousYear || ''} ते ${meta.currentYear || ''} — गाव / मोहल्ला निहाय सारांश`])
  aoa.push(headerRow1)
  aoa.push(headerRow2)

  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NUM_COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NUM_COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: NUM_COLS - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },  // गाव / मोहल्ला
    { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },  // मालमत्ता संख्या
    { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },  // इमारत कर
    { s: { r: 3, c: 5 }, e: { r: 3, c: 7 } },  // दिवा कर
    { s: { r: 3, c: 8 }, e: { r: 3, c: 10 } }, // आरोग्य कर
    { s: { r: 3, c: 11 }, e: { r: 3, c: 13 } }, // पाणीपट्टी कर
    { s: { r: 3, c: 14 }, e: { r: 4, c: 14 } }, // एकूण मागणी
    { s: { r: 3, c: 15 }, e: { r: 4, c: 15 } }, // एकूण वसुली
    { s: { r: 3, c: 16 }, e: { r: 4, c: 16 } }, // शिल्लक (बाकी)
  ]

  const summaryRows = []
  for (const [village, rows] of groups.entries()) {
    const totals = rows.map(computeRowTotals)
    const sum = (key) => totals.reduce((s, t) => s + t[key], 0)
    const paniM = sum('magilPanipattiSamanya') + sum('magilPanipattiVishesh')
    const paniC = sum('chaluPanipattiSamanya') + sum('chaluPanipattiVishesh')
    const rowData = [
      village,
      rows.length,
      sum('magilGharPatti'), sum('chaluGharPatti'), sum('ekunGharPatti'),
      sum('magilDiwabatti'), sum('chaluDiwabatti'), sum('ekunDiwabatti'),
      sum('magilArogya'), sum('chaluArogya'), sum('ekunArogya'),
      paniM, paniC, paniM + paniC,
      sum('demandTotal'), sum('recoveryTotal'), sum('shillakTotal'),
    ]
    summaryRows.push(rowData)
  }
  // Village name, alphabetically (Marathi-aware where possible)
  summaryRows.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'mr'))
  summaryRows.forEach((row) => aoa.push(row))

  if (summaryRows.length > 0) {
    const grand = ['एकूण (Grand Total)']
    for (let c = 1; c < NUM_COLS; c += 1) {
      grand.push(summaryRows.reduce((s, r) => s + (Number(r[c]) || 0), 0))
    }
    aoa.push(grand)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = new Array(NUM_COLS).fill(null).map((_, i) => ({ wch: i === 0 ? 22 : 12 }))
  return ws
}

// ------------------------------------------------------------------
// Sets an Excel "Print Area" defined name for a sheet — supported by
// SheetJS Community Edition via a workbook-level defined name (the
// free `xlsx` package does not expose page-setup/print-title APIs, but
// _xlnm.Print_Area IS a plain defined name and persists correctly).
// ------------------------------------------------------------------
const setPrintArea = (workbook, sheetIndex, sheetName, ref) => {
  workbook.Workbook = workbook.Workbook || {}
  workbook.Workbook.Names = workbook.Workbook.Names || []
  workbook.Workbook.Names.push({
    Sheet: sheetIndex,
    Name: '_xlnm.Print_Area',
    Ref: `'${sheetName}'!${ref}`,
  })
}

// ------------------------------------------------------------------
// Public entry point
// ------------------------------------------------------------------
// records: array of Namuna9 .toResponseJSON()-shaped objects, already
//          numerically sorted by अनुक्रमांक.
// meta: { panchayat, village, taluka, district, previousYear, currentYear }
const buildNamuna9Workbook = (records, meta) => {
  const workbook = XLSX.utils.book_new()

  const namuna9Ws = buildNamuna9Sheet(records, meta)
  XLSX.utils.book_append_sheet(workbook, namuna9Ws, 'Namuna9')

  const { ws: billWs, lastRow: billLastRow } = buildBillSheet(records, meta)
  XLSX.utils.book_append_sheet(workbook, billWs, 'Bill')

  const summaryWs = buildSummary1Sheet(records, meta)
  XLSX.utils.book_append_sheet(workbook, summaryWs, 'summary1')

  const { ws: bill4Ws, lastRow: bill4LastRow } = buildBill4PageSheet(records, meta)
  XLSX.utils.book_append_sheet(workbook, bill4Ws, 'Bill_4Page')

  // Printable page setup: Bill / Bill_4Page print areas (Namuna9 register
  // and summary1 are meant to be scrolled/reviewed on-screen or printed
  // in full — no restricted print area needed for those).
  setPrintArea(workbook, 1, 'Bill', `$A$1:$I$${billLastRow + 1}`)
  setPrintArea(workbook, 3, 'Bill_4Page', `$A$1:$I$${bill4LastRow + 1}`)

  return workbook
}

module.exports = {
  buildNamuna9Workbook,
  // exported for tests / reuse
  COL,
  colLetter,
  computeRowTotals,
}