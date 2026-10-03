const Namuna8 = require('../models/Namuna8')
const Namuna9 = require('../models/Namuna9')
const { AppError } = require('../middleware/errorHandler')
const { saveNamuna9ToExcel } = require('../utils/excelManager')
const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

// ✅ Escapes regex special characters so a panchayat/village name that
// contains them (e.g. "KARLA (BK)") can never be used to build a broken
// or overly-permissive regex.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ✅ Grampanchayat-wise scoping: builds the Mongo filter for a request.
// - A logged-in `user` (non-admin) is ALWAYS hard-locked to their OWN
//   Grampanchayat — `panchayat` matched against `user.gramPanchayatName`.
//   This can NOT be overridden by a `?panchayat=` (or legacy `?village=`)
//   query param, so a "KARLA" gram panchayat user can never see "BORGAON"
//   (or any other village's) Namuna 9 data, no matter what filter is sent
//   from the client.
// - An `admin` sees EVERY Grampanchayat by default, but can still narrow
//   the list down to a single Grampanchayat via `?panchayat=...` (the
//   Namuna 9 page's Grampanchayat filter dropdown).
// - If no user is attached to the request (e.g. legacy/unauthenticated
//   calls) the filter falls back to whatever `panchayat` query param (if
//   any) was passed, preserving old behaviour.
//
// This mirrors the proven, working pattern already used in
// namuna8Controller.js's buildFilter — Namuna 9 must scope the same way.
const buildFilter = (query, user) => {
  const filter = {}

  if (query.previousYear) filter.previousYear = query.previousYear
  if (query.currentYear) filter.currentYear = query.currentYear
  if (query.anukramankList) {
    // ✅ NEW: bulk lookup — People List "बिल तयार करा" sends a
    // comma-separated list of अनुक्रमांक values (one per selected person)
    // and gets back every matching Namuna 9 record in a single query.
    // Still fully subject to the non-admin panchayat lock below.
    const list = String(query.anukramankList)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    filter.anukramank = { $in: list }
  } else if (query.exactAnukramank) {
    // Exact match — used by the Demand Bill "search by Anukramank" flow
    // (e.g. Bill Filter typing "101" must return record 101, not every
    // record whose अनुक्रमांक merely *contains* "101").
    filter.anukramank = String(query.exactAnukramank).trim()
  } else if (query.anukramank) {
    filter.anukramank = { $regex: query.anukramank, $options: 'i' }
  }
  if (query.name) {
    filter.$or = [
      { gharMalakName: { $regex: query.name, $options: 'i' } },
      { bhogvatadarName: { $regex: query.name, $options: 'i' } },
    ]
  }

  if (user && user.role !== 'admin') {
    // 🔒 Non-admins are HARD-LOCKED to their own Grampanchayat. Any
    // `panchayat` (or `village`) value sent from the client is IGNORED —
    // it is intentionally never read here.
    filter.panchayat = user.gramPanchayatName || ''
  } else if (query.panchayat) {
    // Admin (or unauthenticated legacy calls): optional exact-ish,
    // case-insensitive Grampanchayat filter, e.g. from a dropdown.
    filter.panchayat = new RegExp(`^${escapeRegex(String(query.panchayat).trim())}$`, 'i')
  } else if (query.village) {
    // Legacy fallback for any old caller still sending ?village=.
    filter.village = { $regex: query.village, $options: 'i' }
  }

  return filter
}

// ✅ अनुक्रमांक is stored as a String (it can contain leading zeros /
// legacy formats), so a plain Mongo `.sort({ anukramank: 1 })` sorts it
// LEXICOGRAPHICALLY — "10" comes before "2". That silently breaks
// "sequential order" everywhere (table, Excel export, Demand Bill
// Previous/Next). We always re-sort numerically in JS after the query.
const sortByAnukramankNumeric = (records) =>
  [...records].sort((a, b) => {
    const na = parseInt(a.anukramank, 10)
    const nb = parseInt(b.anukramank, 10)
    if (isNaN(na) && isNaN(nb)) return String(a.anukramank).localeCompare(String(b.anukramank))
    if (isNaN(na)) return 1
    if (isNaN(nb)) return -1
    return na - nb
  })

const getAllNamuna9 = async (req, res, next) => {
  try {
    const filter = buildFilter(req.query, req.user)
    let records = sortByAnukramankNumeric(await Namuna9.find(filter))

    if (req.query.dontShowZero === 'true') {
      records = records.filter((r) => {
        const total =
          (r.magilGharPatti || 0) +
          (r.chaluGharPatti || 0) +
          (r.magilDiwabatti || 0) +
          (r.chaluDiwabatti || 0) +
          (r.magilArogya || 0) +
          (r.chaluArogya || 0) +
          (r.magilPanipattiSamanya || 0) +
          (r.chaluPanipattiSamanya || 0) +
          (r.magilPanipattiVishesh || 0) +
          (r.chaluPanipattiVishesh || 0) +
          (r.magilItar || 0) +
          (r.chaluItar || 0)
        return total > 0
      })
    }

    res.status(200).json({
      success: true,
      count: records.length,
      data: records.map((r) => r.toResponseJSON()),
    })
  } catch (error) {
    next(error)
  }
}

const getNamuna9ById = async (req, res, next) => {
  try {
    const record = await Namuna9.findById(req.params.id)

    if (!record) {
      return next(new AppError('Namuna 9 record not found', 404))
    }

    // 🔒 Grampanchayat scoping: a non-admin user may only open a record
    // that belongs to their own Grampanchayat (used by both the table and
    // the Demand Bill print page).
    if (req.user && req.user.role !== 'admin' && (record.panchayat || '') !== (req.user.gramPanchayatName || '')) {
      return next(new AppError('या ग्रामपंचायतीचा रेकॉर्ड पाहण्याची परवानगी नाही', 403))
    }

    res.status(200).json({
      success: true,
      data: record.toResponseJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// ✅ GET /api/namuna9/by-anukramank/:anukramank — exact-match lookup, used
// by the "Anukramank ने search केल्यावर त्या specific record चा Demand
// Bill" flow (Namuna 9 page's Bill Filter, and the Excel Bill Filter
// equivalent). Village + year scoped exactly like everything else.
const getNamuna9ByAnukramank = async (req, res, next) => {
  try {
    const { previousYear, currentYear } = req.query
    const filter = buildFilter(
      { previousYear, currentYear, exactAnukramank: req.params.anukramank },
      req.user,
    )
    const record = await Namuna9.findOne(filter)

    if (!record) {
      return next(new AppError(`अनुक्रमांक ${req.params.anukramank} चा रेकॉर्ड सापडला नाही`, 404))
    }

    res.status(200).json({
      success: true,
      data: record.toResponseJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// ✅ GET /api/namuna9/next-anukramank — max existing (numeric) अनुक्रमांक
// for this village+year, +1. Powers "नवा record add झाल्यावर automatic
// next number यावे" on the Namuna 9 "Add New" form.
const getNextAnukramank = async (req, res, next) => {
  try {
    const { previousYear = '2019', currentYear = '2020' } = req.query
    const filter = buildFilter({ previousYear, currentYear }, req.user)
    const records = await Namuna9.find(filter).select('anukramank')

    const maxNum = records.reduce((max, r) => {
      const n = parseInt(r.anukramank, 10)
      return isNaN(n) ? max : Math.max(max, n)
    }, 0)

    res.status(200).json({
      success: true,
      data: { nextAnukramank: String(maxNum + 1) },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * ✅ FIXED: createNamuna9
 * Admin के gram_panchayat.xlsx में data save करेगा
 */
const createNamuna9 = async (req, res, next) => {
  try {
    console.log('🔍 Creating Namuna9 record...')

    // 🔒 These are computed ONCE here and reused below for both the
    // sibling lookup and the actual create — a non-admin's panchayat can
    // never be spoofed via req.body.
    const panchayat = req.user && req.user.role !== 'admin' ? (req.user.gramPanchayatName || '') : (req.body.panchayat || req.user?.gramPanchayatName || '')
    const village = req.user && req.user.role !== 'admin' ? (req.user.village || '') : (req.body.village || req.user?.village || '')
    const previousYear = req.body.previousYear || '2019'
    const currentYear = req.body.currentYear || '2020'

    // ✅ Sequential अनुक्रमांक safety net: if the client didn't send one
    // (or it's blank), compute the next number ourselves — max existing
    // अनुक्रमांक for this Grampanchayat+year, +1. Numeric, never
    // lexicographic. Scoped by `panchayat` so two Grampanchayats never
    // collide/share a sequence.
    let anukramank = String(req.body.anukramank || '').trim()
    if (!anukramank) {
      const siblings = await Namuna9.find({ panchayat, previousYear, currentYear })
      const maxNum = siblings.reduce((max, r) => {
        const n = parseInt(r.anukramank, 10)
        return isNaN(n) ? max : Math.max(max, n)
      }, 0)
      anukramank = String(maxNum + 1)
    }

    const record = await Namuna9.create({
      ...req.body,
      anukramank,
      createdBy: req.user?._id,
      // 🔒 Non-admin users are always stamped with their OWN Grampanchayat
      // (+ village/taluka/district) — this can NOT be spoofed via the
      // request body. Admins may pass explicit values in the body (e.g.
      // when entering data on behalf of a panchayat).
      village,
      panchayat,
      taluka: req.user && req.user.role !== 'admin' ? (req.user.taluka || '') : (req.body.taluka || req.user?.taluka || ''),
      district: req.user && req.user.role !== 'admin' ? (req.user.district || '') : (req.body.district || req.user?.district || ''),
    })

    console.log(`✅ Record created with anukramank: ${record.anukramank}`)

    // ✅ ADDED: gram_panchayat.xlsx में save करो (admin के लिए)
    console.log('📝 Calling saveNamuna9ToExcel...')
    saveNamuna9ToExcel(record)
    console.log('✅ saveNamuna9ToExcel called successfully')

    res.status(201).json({
      success: true,
      message: 'Namuna 9 record created successfully',
      data: record.toResponseJSON(),
    })
  } catch (error) {
    console.error('❌ Create Namuna9 Error:', error)
    next(error)
  }
}

/**
 * ✅ FIXED: updateNamuna9
 * Admin के gram_panchayat.xlsx में data update करेगा
 */
const updateNamuna9 = async (req, res, next) => {
  try {
    console.log(`🔍 Updating Namuna9 record: ${req.params.id}`)

    // 🔒 STEP 1 — fetch the EXISTING record first and verify ownership
    // BEFORE writing anything. Without this check, any non-admin user who
    // knew (or guessed) another village's record id could edit it —
    // exactly the "दुसऱ्या Grampanchayat चा डेटा मिसळतो" bug.
    const existing = await Namuna9.findById(req.params.id)
    if (!existing) {
      return next(new AppError('Namuna 9 record not found', 404))
    }

    if (req.user && req.user.role !== 'admin' && (existing.panchayat || '') !== (req.user.gramPanchayatName || '')) {
      return next(new AppError('या ग्रामपंचायतीचा रेकॉर्ड बदलण्याची परवानगी नाही', 403))
    }

    // 🔒 STEP 2 — strip any village-spoofing fields from the update body.
    // A non-admin can edit tax/name fields on their OWN record, but can
    // NEVER move it to a different Grampanchayat/village by sending
    // panchayat/village/taluka/district in the request body.
    const updateData = { ...req.body }
    if (req.user && req.user.role !== 'admin') {
      updateData.panchayat = req.user.gramPanchayatName || ''
      updateData.village = req.user.village || ''
      updateData.taluka = req.user.taluka || ''
      updateData.district = req.user.district || ''
    }

    const record = await Namuna9.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })

    if (!record) {
      return next(new AppError('Namuna 9 record not found', 404))
    }

    console.log(`✅ Record updated: ${record.anukramank}`)

    // ✅ ADDED: gram_panchayat.xlsx में update करो
    console.log('📝 Calling saveNamuna9ToExcel...')
    saveNamuna9ToExcel(record)
    console.log('✅ saveNamuna9ToExcel called successfully')

    res.status(200).json({
      success: true,
      message: 'Namuna 9 record updated successfully',
      data: record.toResponseJSON(),
    })
  } catch (error) {
    console.error('❌ Update Namuna9 Error:', error)
    next(error)
  }
}

const deleteNamuna9 = async (req, res, next) => {
  try {
    const record = await Namuna9.findByIdAndDelete(req.params.id)

    if (!record) {
      return next(new AppError('Namuna 9 record not found', 404))
    }

    res.status(200).json({
      success: true,
      message: 'Namuna 9 record deleted successfully',
    })
  } catch (error) {
    next(error)
  }
}

/**
 * ✅ FIXED: fetchFromNamuna8
 * Namuna8 से data fetch करके Namuna9 में save करे
 * और gram_panchayat.xlsx में भी save करे
 */
const fetchFromNamuna8 = async (req, res, next) => {
  try {
    const { previousYear = '2019', currentYear = '2020' } = req.body

    // 🔒 Grampanchayat-wise sync: a non-admin user only pulls in Namuna 8
    // records belonging to their OWN Grampanchayat (matching
    // namuna8Controller's own `fields.panchayat` scoping field), so
    // Namuna 9 never mixes Grampanchayats.
    const namuna8Filter = { 'fields.serial': { $exists: true, $ne: '' } }
    if (req.user && req.user.role !== 'admin') {
      namuna8Filter['fields.panchayat'] = req.user.gramPanchayatName || ''
    }

    const namuna8Records = await Namuna8.find(namuna8Filter)

    const results = []

    for (const n8 of namuna8Records) {
      const summary = n8.toSummaryJSON()

      let existing = await Namuna9.findOne({
        namuna8Id: n8._id,
        previousYear,
        currentYear,
      })

      if (existing) {
        existing.gharMalakName = summary.gharMalakName
        existing.bhogvatadarName = summary.bhogvatadarName
        existing.malmattaKramank = summary.malmattaKramank
        existing.wardKramank = summary.wardKramank
        // ✅ NEW FIELDS synced from Namuna 8
        existing.sarveNo = summary.sarveNo
        existing.plotNo = summary.plotNo
        existing.mobileNo = summary.mobileNo
        existing.aadharNo = summary.aadharNo
        existing.gharkul = summary.gharkul
        existing.village = summary.village
        existing.panchayat = summary.panchayat
        existing.taluka = summary.taluka
        existing.district = summary.district
        existing.anukramank = String(summary.anukramank)
        existing.chaluGharPatti = summary.gharpatti
        existing.chaluDiwabatti = summary.diwabatti
        existing.chaluArogya = summary.arogya
        existing.chaluPanipattiSamanya = summary.panipatti
        await existing.save()
        
        // ✅ ADDED: gram_panchayat.xlsx में update करो
        console.log(`📝 Saving existing Namuna9 to Excel: ${existing.anukramank}`)
        saveNamuna9ToExcel(existing)
        
        results.push(existing)
      } else {
        const created = await Namuna9.create({
          namuna8Id: n8._id,
          createdBy: req.user?._id,
          previousYear,
          currentYear,
          anukramank: String(summary.anukramank),
          gharMalakName: summary.gharMalakName,
          bhogvatadarName: summary.bhogvatadarName,
          malmattaKramank: summary.malmattaKramank,
          wardKramank: summary.wardKramank,
          // ✅ NEW FIELDS synced from Namuna 8
          sarveNo: summary.sarveNo,
          plotNo: summary.plotNo,
          mobileNo: summary.mobileNo,
          aadharNo: summary.aadharNo,
          gharkul: summary.gharkul,
          village: summary.village,
          panchayat: summary.panchayat,
          taluka: summary.taluka,
          district: summary.district,
          chaluGharPatti: summary.gharpatti,
          chaluDiwabatti: summary.diwabatti,
          chaluArogya: summary.arogya,
          chaluPanipattiSamanya: summary.panipatti,
          status: 'बाकी',
        })

        // ✅ ADDED: gram_panchayat.xlsx में save करो
        console.log(`📝 Saving new Namuna9 to Excel: ${created.anukramank}`)
        saveNamuna9ToExcel(created)
        
        results.push(created)
      }
    }

    res.status(200).json({
      success: true,
      message: `Synced ${results.length} records from Namuna 8`,
      count: results.length,
      data: results.map((r) => r.toResponseJSON()),
    })
  } catch (error) {
    console.error('❌ Fetch from Namuna8 Error:', error)
    next(error)
  }
}

/**
 * ✅ FIXED: bulkSaveTax
 * Bulk records save करे और gram_panchayat.xlsx में update करे
 */
const bulkSaveTax = async (req, res, next) => {
  try {
    const { records, previousYear, currentYear } = req.body

    if (!Array.isArray(records) || records.length === 0) {
      return next(new AppError('Records array is required', 400))
    }

    const isNonAdmin = req.user && req.user.role !== 'admin'
    const saved = []
    const skipped = []

    for (const item of records) {
      if (item.id) {
        // 🔒 STEP 1 — verify this row actually belongs to the caller's
        // own Grampanchayat BEFORE updating it. This is the fix for the
        // main bug: the table's "Save Tax" button bulk-saves whatever is
        // currently in local state, and previously this endpoint trusted
        // that blindly — any stray/stale row from another village would
        // get silently written straight into the database.
        if (isNonAdmin) {
          const existing = await Namuna9.findById(item.id).select('panchayat')
          if (!existing || (existing.panchayat || '') !== (req.user.gramPanchayatName || '')) {
            skipped.push(item.id)
            continue
          }
        }

        // 🔒 STEP 2 — strip village-spoofing fields for non-admins.
        const updatePayload = { ...item, previousYear, currentYear }
        if (isNonAdmin) {
          updatePayload.panchayat = req.user.gramPanchayatName || ''
          updatePayload.village = req.user.village || ''
          updatePayload.taluka = req.user.taluka || ''
          updatePayload.district = req.user.district || ''
        }

        const updated = await Namuna9.findByIdAndUpdate(
          item.id,
          updatePayload,
          { new: true, runValidators: true },
        )
        if (updated) {
          // ✅ ADDED: gram_panchayat.xlsx में update करो
          console.log(`📝 Saving updated tax record to Excel: ${updated.anukramank}`)
          saveNamuna9ToExcel(updated)
          
          saved.push(updated)
        }
      } else {
        // 🔒 New row created from the table (no id yet) — same hard lock
        // as createNamuna9, so a non-admin can never sneak in a row
        // stamped with another Grampanchayat.
        const createPayload = { ...item, previousYear, currentYear, createdBy: req.user?._id }
        if (isNonAdmin) {
          createPayload.panchayat = req.user.gramPanchayatName || ''
          createPayload.village = req.user.village || ''
          createPayload.taluka = req.user.taluka || ''
          createPayload.district = req.user.district || ''
        }

        const created = await Namuna9.create(createPayload)
        
        // ✅ ADDED: gram_panchayat.xlsx में save करो
        console.log(`📝 Saving new tax record to Excel: ${created.anukramank}`)
        saveNamuna9ToExcel(created)
        
        saved.push(created)
      }
    }

    if (skipped.length > 0) {
      console.warn(`⚠️ bulkSaveTax: skipped ${skipped.length} record(s) not belonging to ${req.user?.gramPanchayatName} — ids: ${skipped.join(', ')}`)
    }

    res.status(200).json({
      success: true,
      message: skipped.length > 0
        ? `${saved.length} tax records saved, ${skipped.length} रेकॉर्ड्स तुमच्या ग्रामपंचायतीचे नसल्याने वगळले गेले`
        : `${saved.length} tax records saved`,
      count: saved.length,
      skippedCount: skipped.length,
      data: saved.map((r) => r.toResponseJSON()),
    })
  } catch (error) {
    console.error('❌ Bulk Save Tax Error:', error)
    next(error)
  }
}

// ============================================
// 📊 Shared totals helper — mirrors the frontend's calculateTotals(), so
// Excel exports show the same एकूण/शिल्लक columns visible on screen.
// ============================================
const calcNamuna9Totals = (r) => {
  const ekunGharPatti = (r.magilGharPatti || 0) + (r.chaluGharPatti || 0);
  const ekunDiwabatti = (r.magilDiwabatti || 0) + (r.chaluDiwabatti || 0);
  const ekunArogya = (r.magilArogya || 0) + (r.chaluArogya || 0);
  // ✅ पाणीपट्टी सामान्य + विशेष — combined "एकूण पाणीपट्टी कर" (used in एकूण कर
  // below) is सामान्य + विशेष together, but each is also reported on its
  // own for the Excel/UI columns.
  const ekunPanipattiSamanya = (r.magilPanipattiSamanya || 0) + (r.chaluPanipattiSamanya || 0);
  const ekunPanipattiVishesh = (r.magilPanipattiVishesh || 0) + (r.chaluPanipattiVishesh || 0);
  const ekunPanipatti = ekunPanipattiSamanya + ekunPanipattiVishesh;
  const ekunItar = (r.magilItar || 0) + (r.chaluItar || 0);

  const ekunGharPattiVasuli = (r.magilGharPattiVasuli || 0) + (r.chaluGharPattiVasuli || 0);
  const ekunDiwabattiVasuli = (r.magilDiwabattiVasuli || 0) + (r.chaluDiwabattiVasuli || 0);
  const ekunArogyaVasuli = (r.magilArogyaVasuli || 0) + (r.chaluArogyaVasuli || 0);
  const ekunPanipattiVasuli = (r.magilPanipattiVasuli || 0) + (r.chaluPanipattiVasuli || 0);
  const ekunItarVasuli = (r.magilItarVasuli || 0) + (r.chaluItarVasuli || 0);

  const ekunKarVasuli = ekunGharPattiVasuli + ekunDiwabattiVasuli + ekunArogyaVasuli + ekunPanipattiVasuli + ekunItarVasuli;
  const ekunKar = ekunGharPatti + ekunDiwabatti + ekunArogya + ekunPanipatti + ekunItar;
  const bakiRakkam = ekunKar - ekunKarVasuli;
  const shillak = Math.max(0, bakiRakkam);

  return {
    ekunGharPatti, ekunDiwabatti, ekunArogya,
    ekunPanipattiSamanya, ekunPanipattiVishesh, ekunPanipatti,
    ekunItar, ekunKarVasuli, ekunKar, bakiRakkam, shillak,
  };
};

// ============================================
// 📖 Column schemas matching the official मागणी/वसूली register PDFs
// exactly (group header spanning मागील|चालू|एकूण, etc.). `single: true`
// columns span both header rows vertically (अ.नु., मालमत्ता क्र., शेरा...);
// everything else is a group whose `label` sits on the merged top row and
// whose `subs` sit on the row below, with `keys` pointing at the matching
// keys in the row-object returned by buildNamuna9DemandRow/VasuliRow.
// ============================================
const MAGNI_COLUMNS = [
  // Paper मागणी नोंदवही — no टिप/शेरा column
  { single: true, key: 'अ.नु.', label: 'अ.नु.' },
  { single: true, key: 'मालमत्ता क्र.', label: 'मालमत्ता क्र.' },
  { single: true, key: 'ज्या इसमाकडून कर घेणे असेल त्यांची नांवे', label: 'ज्या इसमाकडून कर घेणे असेल त्यांची नांवे' },
  { label: 'इमारत कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['इमारत कर मागील', 'इमारत कर चालू', 'इमारत कर एकूण'] },
  { label: 'दिवा कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['दिवा कर मागील', 'दिवा कर चालू', 'दिवा कर एकूण'] },
  { label: 'आरोग्य कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['आरोग्य कर मागील', 'आरोग्य कर चालू', 'आरोग्य कर एकूण'] },
  { label: 'सामान्य पाणी कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['पाणीपट्टी सामान्य कर मागील', 'पाणीपट्टी सामान्य कर चालू', 'पाणीपट्टी सामान्य कर एकूण'] },
  { label: 'खास पाणी कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['पाणीपट्टी विशेष कर मागील', 'पाणीपट्टी विशेष कर चालू', 'पाणीपट्टी विशेष कर एकूण'] },
  { label: 'एकूण', subs: ['मागील', 'चालू', 'एकूण'], keys: ['एकूण मागील', 'एकूण चालू', 'एकूण एकूण'] },
  { single: true, key: 'पावती क्र.', label: 'पावती क्र.' },
]

const VASULI_COLUMNS = [
  // Paper वसूली नोंदवही — no टिप/शेरा column
  { single: true, key: 'अ.नु.', label: 'अ.नु.' },
  { label: 'इमारत कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['इमारत कर मागील', 'इमारत कर चालू', 'इमारत कर एकूण'] },
  { label: 'दिवा कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['दिवा कर मागील', 'दिवा कर चालू', 'दिवा कर एकूण'] },
  { label: 'आरोग्य कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['आरोग्य कर मागील', 'आरोग्य कर चालू', 'आरोग्य कर एकूण'] },
  { label: 'सामान्य पाणी कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['पाणीपट्टी सामान्य कर मागील', 'पाणीपट्टी सामान्य कर चालू', 'पाणीपट्टी सामान्य कर एकूण'] },
  { label: 'खास पाणी कर', subs: ['मागील', 'चालू', 'एकूण'], keys: ['पाणीपट्टी विशेष कर मागील', 'पाणीपट्टी विशेष कर चालू', 'पाणीपट्टी विशेष कर एकूण'] },
  { label: 'एकूण', subs: ['मागील', 'चालू', 'एकूण'], keys: ['एकूण मागील', 'एकूण चालू', 'एकूण एकूण'] },
  { label: 'शिल्लक कर', subs: ['इमारत', 'दिवा', 'आरोग्य', 'पाणीपट्टी', 'एकूण'], keys: ['शिल्लक कर इमारत', 'शिल्लक कर दिवा', 'शिल्लक कर आरोग्य', 'शिल्लक कर पाणीपट्टी', 'शिल्लक कर एकूण'] },
  { single: true, key: 'पावती क्र.', label: 'पावती क्र.' },
]

// ✅ Builds an XLSX worksheet with a real official-register look: 3
// centered/merged title rows ("ग्रामपंचायत कार्यालय ...", "सन XXXX-YYYY
// वर्षाच्या कर आकारणी केलेल्या ... चे नोंदणी पुस्तक", "ग्रामपंचायत : ... गाव :
// ... तालुका : ... जिल्हा : ..."), then a proper 2-row grouped column
// header (group label merged across मागील|चालू|एकूण, etc., matching the
// magni/vasuli reference PDFs) — NOT the flat single-row header the
// client rejected.
const buildGroupedRegisterSheet = (columns, titleLines, dataRows, totalRow) => {
  const totalCols = columns.reduce((n, c) => n + (c.single ? 1 : c.subs.length), 0)
  const aoa = []
  const merges = []

  titleLines.forEach((line, i) => {
    aoa.push([line])
    merges.push({ s: { r: i, c: 0 }, e: { r: i, c: totalCols - 1 } })
  })
  const titleRowCount = titleLines.length
  const groupRow = titleRowCount
  const subRow = titleRowCount + 1

  const groupHeaderRow = []
  const subHeaderRow = []
  let colIdx = 0
  columns.forEach((c) => {
    if (c.single) {
      groupHeaderRow[colIdx] = c.label
      subHeaderRow[colIdx] = ''
      merges.push({ s: { r: groupRow, c: colIdx }, e: { r: subRow, c: colIdx } })
      colIdx += 1
    } else {
      groupHeaderRow[colIdx] = c.label
      merges.push({ s: { r: groupRow, c: colIdx }, e: { r: groupRow, c: colIdx + c.subs.length - 1 } })
      c.subs.forEach((s, i) => { subHeaderRow[colIdx + i] = s })
      colIdx += c.subs.length
    }
  })
  aoa.push(groupHeaderRow)
  aoa.push(subHeaderRow)

  const flattenRow = (rowObj) => {
    const arr = []
    columns.forEach((c) => {
      if (c.single) arr.push(rowObj[c.key] ?? '')
      else c.keys.forEach((k) => arr.push(rowObj[k] ?? 0))
    })
    return arr
  }

  dataRows.forEach((r) => aoa.push(flattenRow(r)))
  if (totalRow) aoa.push(flattenRow(totalRow))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  // Reasonable default column widths so the register is readable without
  // manual resizing — property/name columns wider, tax columns narrower.
  ws['!cols'] = columns.flatMap((c) =>
    c.single
      ? [{ wch: c.key.includes('नांवे') || c.key.includes('शेरा') ? 28 : 14 }]
      : c.subs.map(() => ({ wch: 10 }))
  )
  return ws
}

// ✅ ONE sheet SIDE-BY-SIDE (paper style):
//   LEFT  = मागणी नोंदवही
//   RIGHT = वसूली नोंदवही
// Blank spacer row after every अनुक्रमांक data row (paper line gap).
const buildCombinedMagniVasuliSheet = (meta, demandData, demandTotalRow, vasuliData, vasuliTotalRow) => {
  const colCount = (columns) =>
    columns.reduce((n, c) => n + (c.single ? 1 : c.subs.length), 0)

  const flattenRow = (columns, rowObj) => {
    const arr = []
    columns.forEach((c) => {
      if (c.single) arr.push(rowObj[c.key] ?? '')
      else c.keys.forEach((k) => arr.push(rowObj[k] ?? 0))
    })
    return arr
  }

  const buildHeaderBlock = (columns, titleLines, sectionBanner) => {
    const n = colCount(columns)
    const aoa = []
    const merges = [] // relative to section start row 0

    titleLines.forEach((line, i) => {
      const row = new Array(n).fill('')
      row[0] = line
      aoa.push(row)
      merges.push({ s: { r: i, c: 0 }, e: { r: i, c: n - 1 } })
    })

    // Photo-style section name row: "मागणी" / "वसूली" above column groups
    if (sectionBanner) {
      const bannerRowIdx = aoa.length
      const bannerRow = new Array(n).fill('')
      bannerRow[0] = sectionBanner
      aoa.push(bannerRow)
      merges.push({ s: { r: bannerRowIdx, c: 0 }, e: { r: bannerRowIdx, c: n - 1 } })
    }

    const groupRow = aoa.length
    const subRow = aoa.length + 1
    const groupHeaderRow = new Array(n).fill('')
    const subHeaderRow = new Array(n).fill('')
    let colIdx = 0
    columns.forEach((c) => {
      if (c.single) {
        groupHeaderRow[colIdx] = c.label
        subHeaderRow[colIdx] = ''
        merges.push({ s: { r: groupRow, c: colIdx }, e: { r: subRow, c: colIdx } })
        colIdx += 1
      } else {
        groupHeaderRow[colIdx] = c.label
        merges.push({
          s: { r: groupRow, c: colIdx },
          e: { r: groupRow, c: colIdx + c.subs.length - 1 },
        })
        c.subs.forEach((s, i) => {
          subHeaderRow[colIdx + i] = s
        })
        colIdx += c.subs.length
      }
    })
    aoa.push(groupHeaderRow)
    aoa.push(subHeaderRow)
    return { aoa, merges, n }
  }

  // Data rows with a blank spacer after EACH record (paper gap under anukramank)
  const buildDataBlock = (columns, dataRows, totalRow) => {
    const n = colCount(columns)
    const aoa = []
    dataRows.forEach((r) => {
      aoa.push(flattenRow(columns, r))
      aoa.push(new Array(n).fill('')) // space under each अनुक्रमांक
    })
    if (totalRow) {
      aoa.push(flattenRow(columns, totalRow))
    }
    return aoa
  }

  const leftHead = buildHeaderBlock(MAGNI_COLUMNS, titleLinesFor('मागणी', meta), 'मागणी')
  const rightHead = buildHeaderBlock(VASULI_COLUMNS, titleLinesFor('वसूली', meta), 'वसूली')
  const leftData = buildDataBlock(MAGNI_COLUMNS, demandData, demandTotalRow)
  const rightData = buildDataBlock(VASULI_COLUMNS, vasuliData, vasuliTotalRow)

  const leftCols = leftHead.n
  const rightCols = rightHead.n
  const gapCols = 1 // blank column between मागणी | वसूली
  const rightOffset = leftCols + gapCols

  // Header rows must align (same count). Pad shorter title block if needed.
  const headerRowCount = Math.max(leftHead.aoa.length, rightHead.aoa.length)
  while (leftHead.aoa.length < headerRowCount) {
    leftHead.aoa.push(new Array(leftCols).fill(''))
  }
  while (rightHead.aoa.length < headerRowCount) {
    rightHead.aoa.push(new Array(rightCols).fill(''))
  }

  const leftBody = [...leftHead.aoa, ...leftData]
  const rightBody = [...rightHead.aoa, ...rightData]
  const totalRows = Math.max(leftBody.length, rightBody.length)

  const padRow = (row, n) => {
    const r = (row || []).slice()
    while (r.length < n) r.push('')
    return r
  }

  const aoa = []
  for (let i = 0; i < totalRows; i++) {
    const L = padRow(leftBody[i], leftCols)
    const gap = new Array(gapCols).fill('')
    const R = padRow(rightBody[i], rightCols)
    aoa.push([...L, ...gap, ...R])
  }

  // Merges: left as-is; right shifted by rightOffset; only header merges
  const merges = []
  leftHead.merges.forEach((m) => {
    merges.push({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
    })
  })
  rightHead.merges.forEach((m) => {
    merges.push({
      s: { r: m.s.r, c: m.s.c + rightOffset },
      e: { r: m.e.r, c: m.e.c + rightOffset },
    })
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges

  const leftWidths = MAGNI_COLUMNS.flatMap((c) =>
    c.single
      ? [{ wch: c.key && c.key.includes('नांवे') ? 26 : 12 }]
      : c.subs.map(() => ({ wch: 9 }))
  )
  const rightWidths = VASULI_COLUMNS.flatMap((c) =>
    c.single
      ? [{ wch: 12 }]
      : c.subs.map(() => ({ wch: 9 }))
  )
  ws['!cols'] = [...leftWidths, { wch: 2 }, ...rightWidths]
  return ws
}

// ============================================
// 📖 मागणी (Demand) sheet row — follows the official "मागणी पुस्तक"
// register column order: अ.नु. | मालमत्ता क्र. | नांव | इमारत कर
// (मागील|चालू|एकूण) | दिवा कर (...) | आरोग्य कर (...) | पाणीपट्टी सामान्य कर
// (...) | पाणीपट्टी विशेष कर (...) | एकूण (मागील|चालू|एकूण) | शेरा.
// NO पावती क्र. column — अनुक्रमांक (अ.नु.) itself IS the पावती क्रमांक.
//
// Sourced from Namuna 8 (`r` = a Namuna8-shaped object, चालू कर = Namुना
// 8's valuation tax); मागील/विशेष default to 0 unless the caller has
// already merged in a matching Namuna 9 record's values (done in
// downloadAllNamuna9/downloadMyNamuna9 below).
// ============================================
const buildNamuna9DemandRow = (r) => {
  const magilGharPatti = r.magilGharPatti || 0
  const chaluGharPatti = r.chaluGharPatti || 0
  const magilDiwabatti = r.magilDiwabatti || 0
  const chaluDiwabatti = r.chaluDiwabatti || 0
  const magilArogya = r.magilArogya || 0
  const chaluArogya = r.chaluArogya || 0
  const magilPanipattiSamanya = r.magilPanipattiSamanya || 0
  const chaluPanipattiSamanya = r.chaluPanipattiSamanya || 0
  const magilPanipattiVishesh = r.magilPanipattiVishesh || 0
  const chaluPanipattiVishesh = r.chaluPanipattiVishesh || 0

  const ekunGharPatti = magilGharPatti + chaluGharPatti
  const ekunDiwabatti = magilDiwabatti + chaluDiwabatti
  const ekunArogya = magilArogya + chaluArogya
  const ekunPanipattiSamanya = magilPanipattiSamanya + chaluPanipattiSamanya
  const ekunPanipattiVishesh = magilPanipattiVishesh + chaluPanipattiVishesh

  const magilEkun = magilGharPatti + magilDiwabatti + magilArogya + magilPanipattiSamanya + magilPanipattiVishesh
  const chaluEkun = chaluGharPatti + chaluDiwabatti + chaluArogya + chaluPanipattiSamanya + chaluPanipattiVishesh
  const ekunEkun = magilEkun + chaluEkun

  return {
    "अ.नु.": r.anukramank || '',
    "मालमत्ता क्र.": r.malmattaKramank || '',
    "ज्या इसमाकडून कर घेणे असेल त्यांची नांवे": r.gharMalakName || '',

    "इमारत कर मागील": magilGharPatti,
    "इमारत कर चालू": chaluGharPatti,
    "इमारत कर एकूण": ekunGharPatti,
    "दिवा कर मागील": magilDiwabatti,
    "दिवा कर चालू": chaluDiwabatti,
    "दिवा कर एकूण": ekunDiwabatti,
    "आरोग्य कर मागील": magilArogya,
    "आरोग्य कर चालू": chaluArogya,
    "आरोग्य कर एकूण": ekunArogya,
    "पाणीपट्टी सामान्य कर मागील": magilPanipattiSamanya,
    "पाणीपट्टी सामान्य कर चालू": chaluPanipattiSamanya,
    "पाणीपट्टी सामान्य कर एकूण": ekunPanipattiSamanya,
    "पाणीपट्टी विशेष कर मागील": magilPanipattiVishesh,
    "पाणीपट्टी विशेष कर चालू": chaluPanipattiVishesh,
    "पाणीपट्टी विशेष कर एकूण": ekunPanipattiVishesh,

    "एकूण मागील": magilEkun,
    "एकूण चालू": chaluEkun,
    "एकूण एकूण": ekunEkun,

    "पावती क्र.": r.anukramank || r.pavatiKramank || '',
  };
};

const buildNamuna9DemandTotalRow = (excelData) => {
  const sumCol = (key) => excelData.reduce((sum, row) => sum + (parseFloat(row[key]) || 0), 0);
  return {
    "अ.नु.": 'एकूण (Total)',
    "मालमत्ता क्र.": '',
    "ज्या इसमाकडून कर घेणे असेल त्यांची नांवे": '',
    "इमारत कर मागील": sumCol("इमारत कर मागील").toFixed(2),
    "इमारत कर चालू": sumCol("इमारत कर चालू").toFixed(2),
    "इमारत कर एकूण": sumCol("इमारत कर एकूण").toFixed(2),
    "दिवा कर मागील": sumCol("दिवा कर मागील").toFixed(2),
    "दिवा कर चालू": sumCol("दिवा कर चालू").toFixed(2),
    "दिवा कर एकूण": sumCol("दिवा कर एकूण").toFixed(2),
    "आरोग्य कर मागील": sumCol("आरोग्य कर मागील").toFixed(2),
    "आरोग्य कर चालू": sumCol("आरोग्य कर चालू").toFixed(2),
    "आरोग्य कर एकूण": sumCol("आरोग्य कर एकूण").toFixed(2),
    "पाणीपट्टी सामान्य कर मागील": sumCol("पाणीपट्टी सामान्य कर मागील").toFixed(2),
    "पाणीपट्टी सामान्य कर चालू": sumCol("पाणीपट्टी सामान्य कर चालू").toFixed(2),
    "पाणीपट्टी सामान्य कर एकूण": sumCol("पाणीपट्टी सामान्य कर एकूण").toFixed(2),
    "पाणीपट्टी विशेष कर मागील": sumCol("पाणीपट्टी विशेष कर मागील").toFixed(2),
    "पाणीपट्टी विशेष कर चालू": sumCol("पाणीपट्टी विशेष कर चालू").toFixed(2),
    "पाणीपट्टी विशेष कर एकूण": sumCol("पाणीपट्टी विशेष कर एकूण").toFixed(2),
    "एकूण मागील": sumCol("एकूण मागील").toFixed(2),
    "एकूण चालू": sumCol("एकूण चालू").toFixed(2),
    "एकूण एकूण": sumCol("एकूण एकूण").toFixed(2),
    "पावती क्र.": '',
  };
};

// ============================================
// 📖 वसूली (Collection) sheet row — follows the official "वसूली पुस्तक"
// register column order (Image 2): अ.नु. | इमारत/दिवा/आरोग्य/पाणीपट्टी कर
// (मागील|चालू|एकूण) | एकूण (मागील|चालू|एकूण) | शिल्लक कर (इमारत|दिवा|आरोग्य|
// पाणीपट्टी|एकूण) | शेरा. NO पावती क्र. column.
//
// Sourced from NAMुना 9 (`r` = a Namuna9 record's toResponseJSON) — this
// is the actual collection/vasuli ledger.
// ============================================
const buildNamuna9VasuliRow = (r) => {
  const totals = calcNamuna9Totals(r);

  const ekunGharPattiVasuli = (r.magilGharPattiVasuli || 0) + (r.chaluGharPattiVasuli || 0);
  const ekunDiwabattiVasuli = (r.magilDiwabattiVasuli || 0) + (r.chaluDiwabattiVasuli || 0);
  const ekunArogyaVasuli = (r.magilArogyaVasuli || 0) + (r.chaluArogyaVasuli || 0);
  const ekunPanipattiVasuli = (r.magilPanipattiVasuli || 0) + (r.chaluPanipattiVasuli || 0);

  const shillakGharPatti = totals.ekunGharPatti - ekunGharPattiVasuli;
  const shillakDiwabatti = totals.ekunDiwabatti - ekunDiwabattiVasuli;
  const shillakArogya = totals.ekunArogya - ekunArogyaVasuli;
  const shillakPanipatti = (totals.ekunPanipattiSamanya + totals.ekunPanipattiVishesh) - ekunPanipattiVasuli;

  // ✅ वसूली amounts = 0 — user fills manually in Excel (paper register style)
  return {
    "अ.नु.": r.anukramank || '',

    "इमारत कर मागील": 0,
    "इमारत कर चालू": 0,
    "इमारत कर एकूण": 0,
    "दिवा कर मागील": 0,
    "दिवा कर चालू": 0,
    "दिवा कर एकूण": 0,
    "आरोग्य कर मागील": 0,
    "आरोग्य कर चालू": 0,
    "आरोग्य कर एकूण": 0,
    "पाणीपट्टी सामान्य कर मागील": 0,
    "पाणीपट्टी सामान्य कर चालू": 0,
    "पाणीपट्टी सामान्य कर एकूण": 0,
    "पाणीपट्टी विशेष कर मागील": 0,
    "पाणीपट्टी विशेष कर चालू": 0,
    "पाणीपट्टी विशेष कर एकूण": 0,

    "एकूण मागील": 0,
    "एकूण चालू": 0,
    "एकूण एकूण": 0,

    "शिल्लक कर इमारत": 0,
    "शिल्लक कर दिवा": 0,
    "शिल्लक कर आरोग्य": 0,
    "शिल्लक कर पाणीपट्टी": 0,
    "शिल्लक कर एकूण": 0,

    "पावती क्र.": r.anukramank || r.pavatiKramank || '',
  };
};

const buildNamuna9VasuliTotalRow = (excelData) => {
  // All zeros — matches blank वसूली amounts for manual Excel entry
  return {
    "अ.नु.": 'एकूण (Total)',
    "इमारत कर मागील": 0,
    "इमारत कर चालू": 0,
    "इमारत कर एकूण": 0,
    "दिवा कर मागील": 0,
    "दिवा कर चालू": 0,
    "दिवा कर एकूण": 0,
    "आरोग्य कर मागील": 0,
    "आरोग्य कर चालू": 0,
    "आरोग्य कर एकूण": 0,
    "पाणीपट्टी सामान्य कर मागील": 0,
    "पाणीपट्टी सामान्य कर चालू": 0,
    "पाणीपट्टी सामान्य कर एकूण": 0,
    "पाणीपट्टी विशेष कर मागील": 0,
    "पाणीपट्टी विशेष कर चालू": 0,
    "पाणीपट्टी विशेष कर एकूण": 0,
    "एकूण मागील": 0,
    "एकूण चालू": 0,
    "एकूण एकूण": 0,
    "शिल्लक कर इमारत": 0,
    "शिल्लक कर दिवा": 0,
    "शिल्लक कर आरोग्य": 0,
    "शिल्लक कर पाणीपट्टी": 0,
    "शिल्लक कर एकूण": 0,
    "पावती क्र.": '',
  };
};

// ============================================
// 📖 Builds the two Excel sheets (मागणी + वसूली) for a given scope.
// मागणी = Namuna8 people records (चालू कर) enriched with any matching
//         Namuna9 record's मागील/विशेष/चालू values (more authoritative
//         once a ledger entry exists) — per client requirement, मागणी's
//         data source is Namuna 8.
// वसूली = Namuna9 records directly (the actual collection ledger).
// ============================================
const buildMagniAndVasuliWorkbookData = async (namuna8Filter, namuna9Filter) => {
  const [namuna8Records, namuna9Records] = await Promise.all([
    Namuna8.find(namuna8Filter),
    Namuna9.find(namuna9Filter),
  ])

  const namuna9ByAnukramank = new Map(
    namuna9Records.map((r) => [String(r.anukramank || '').trim(), r.toResponseJSON()])
  )

  const namuna8Summaries = namuna8Records
    .map((r) => r.toSummaryJSON())
    .sort((a, b) => (parseFloat(a.anukramank) || 0) - (parseFloat(b.anukramank) || 0))

  const demandData = namuna8Summaries.map((n8) => {
    const n9 = namuna9ByAnukramank.get(String(n8.anukramank || '').trim())
    // Base: Namuna8's own valuation tax, mapped onto Namuna9-shaped keys
    // (चालू only — Namuna8 has no मागील/विशेष concept).
    const base = {
      anukramank: n8.anukramank,
      malmattaKramank: n8.malmattaKramank,
      gharMalakName: n8.gharMalakName,
      magilGharPatti: 0, chaluGharPatti: n8.gharpatti || 0,
      magilDiwabatti: 0, chaluDiwabatti: n8.diwabatti || 0,
      magilArogya: 0, chaluArogya: n8.arogya || 0,
      magilPanipattiSamanya: 0, chaluPanipattiSamanya: n8.panipatti || 0,
      magilPanipattiVishesh: 0, chaluPanipattiVishesh: 0,
      shera: '',
    }
    // If a Namuna9 ledger entry exists for this same अनुक्रमांक, it is
    // more authoritative — overlay its मागील/चालू/विशेष values (owner
    // name/मालमत्ता क्र. always stay from Namuna8, per the "मागणी data
    // source = Namuna8" requirement).
    const merged = n9 ? {
      ...base,
      magilGharPatti: n9.magilGharPatti || 0, chaluGharPatti: n9.chaluGharPatti || 0,
      magilDiwabatti: n9.magilDiwabatti || 0, chaluDiwabatti: n9.chaluDiwabatti || 0,
      magilArogya: n9.magilArogya || 0, chaluArogya: n9.chaluArogya || 0,
      magilPanipattiSamanya: n9.magilPanipattiSamanya || 0, chaluPanipattiSamanya: n9.chaluPanipattiSamanya || 0,
      magilPanipattiVishesh: n9.magilPanipattiVishesh || 0, chaluPanipattiVishesh: n9.chaluPanipattiVishesh || 0,
      shera: n9.shera || '',
    } : base
    return buildNamuna9DemandRow(merged)
  })


  const vasuliRecords = sortByAnukramankNumeric(namuna9Records)
  const vasuliData = vasuliRecords.map((r) => buildNamuna9VasuliRow(r.toResponseJSON()))

  const demandTotalRow = demandData.length > 0 ? buildNamuna9DemandTotalRow(demandData) : null
  const vasuliTotalRow = vasuliData.length > 0 ? buildNamuna9VasuliTotalRow(vasuliData) : null

  // ✅ Register header metadata — ग्रामपंचायत/गाव/तालुका/जिल्हा/सन, matching
  // the "ग्रामपंचायत कार्यालय रोठा" / "ग्रामपंचायत : रोठा  गाव : ...  तालुका :
  // ...  जिल्हा : ..." title lines from the reference PDFs. Pulled from
  // whichever record has it (all records in a scoped export share the
  // same Grampanchayat); falls back to "सर्व ग्रामपंचायती" for the
  // admin's all-villages export.
  const sample = namuna9Records[0] || namuna8Records[0]
  const meta = {
    panchayat: (sample && (sample.panchayat || sample.fields?.panchayat)) || 'सर्व ग्रामपंचायती',
    village: (sample && (sample.village || sample.fields?.village)) || '',
    taluka: (sample && (sample.taluka || sample.fields?.taluka)) || '',
    district: (sample && (sample.district || sample.fields?.district)) || '',
    previousYear: (namuna9Records[0] && namuna9Records[0].previousYear) || '',
    currentYear: (namuna9Records[0] && namuna9Records[0].currentYear) || '',
  }

  return { demandData, demandTotalRow, vasuliData, vasuliTotalRow, meta }
}

const titleLinesFor = (bookLabel, meta) => {
  const yearLine = meta.previousYear && meta.currentYear
    ? `सन ${meta.previousYear} - ${meta.currentYear} वर्षाच्या कर आकारणी केलेल्या ${bookLabel} चे नोंदणी पुस्तक`
    : `${bookLabel} चे नोंदणी पुस्तक`
  return [
    `ग्रामपंचायत कार्यालय ${meta.panchayat}`,
    yearLine,
    `ग्रामपंचायत : ${meta.panchayat}   गाव : ${meta.village}   तालुका : ${meta.taluka}   जिल्हा : ${meta.district}`,
  ]
}

/**
 * ✅ FIXED: downloadAllNamuna9
 * Admin के लिए - सब users का data
 * gram_panchayat.xlsx से लेगा
 */
const downloadAllNamuna9 = async (req, res, next) => {
  try {
    // ✅ This endpoint spans EVERY village — must stay admin-only, or any
    // logged-in gram panchayat user could download every other village's
    // data too.
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin सर्व गावांचा डेटा डाउनलोड करू शकतो', 403))
    }

    console.log('📥 Admin downloading all Namuna9 records...')

    // ✅ मागणी (Demand, from Namuna8) and वसूली (Collection, from Namuna9)
    // as two clearly separate sheets, matching the official register
    // formats exactly (no पावती क्र. column — अ.नु. IS the receipt number).
    const { demandData, demandTotalRow, vasuliData, vasuliTotalRow, meta } = await buildMagniAndVasuliWorkbookData({}, {})

    console.log(`📊 मागणी: ${demandData.length} rows, वसूली: ${vasuliData.length} rows`)

    const workbook = XLSX.utils.book_new()
    // ✅ एकाच sheet मध्ये: मागणी पहिले, लगेच खाली वसूली
    XLSX.utils.book_append_sheet(
      workbook,
      buildCombinedMagniVasuliSheet(meta, demandData, demandTotalRow, vasuliData, vasuliTotalRow),
      'मागणी-वसूली'
    )

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Namuna9_All.xlsx'
    )
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.send(buffer)

  } catch (error) {
    console.error('❌ Download All Namuna9 error:', error)
    next(error)
  }
}

/**
 * ✅ FIXED: downloadMyNamuna9
 * User के लिए - सिर्फ अपना data
 * createdBy से filter होता है!
 */
const downloadMyNamuna9 = async (req, res, next) => {
  try {
    // 🔒 Grampanchayat-wise export: the Excel export is a shared
    // GRAMPANCHAYAT register (like the paper "मागणी चोपडी"), not a
    // per-user private list — every user from the same Grampanchayat
    // must see the same rows. Admins get everything.
    const isAdmin = req.user.role === 'admin'
    const namuna8Filter = isAdmin ? {} : { 'fields.panchayat': req.user.gramPanchayatName || '' }
    const namuna9Filter = isAdmin ? {} : { panchayat: req.user.gramPanchayatName || '' }

    console.log(`📥 User ${req.user.username} (Grampanchayat: ${req.user.gramPanchayatName}) साठी Namuna9 Excel बनवत आहे`)

    const { demandData, demandTotalRow, vasuliData, vasuliTotalRow, meta } = await buildMagniAndVasuliWorkbookData(namuna8Filter, namuna9Filter)

    const workbook = XLSX.utils.book_new()
    // ✅ एकाच sheet मध्ये: मागणी पहिले, लगेच खाली वसूली
    XLSX.utils.book_append_sheet(
      workbook,
      buildCombinedMagniVasuliSheet(meta, demandData, demandTotalRow, vasuliData, vasuliTotalRow),
      'मागणी-वसूली'
    )

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Namuna9_MyRecords_${req.user.username}.xlsx`
    )
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.send(buffer)

  } catch (error) {
    console.error('❌ Download My Namuna9 error:', error)
    next(error)
  }
}

/**
 * ✅ LEGACY: exportNamuna9Excel
 * Backup download function
 */
const exportNamuna9Excel = async (req, res, next) => {
  try {
    // 🔒 Grampanchayat-scoped + numerically sequential, same as downloadMyNamuna9
    const filter = req.user.role === 'admin' ? {} : { panchayat: req.user.gramPanchayatName || '' }
    const records = sortByAnukramankNumeric(await Namuna9.find(filter))

    const excelData = records.map((r) => ({
      "अनुक्रमांक": r.anukramank || '',
      "घरमालकाचे नाव": r.gharMalakName || '',
      "भोगवटादाराचे नाव": r.bhogvatadarName || '',
      "मालमत्ता क्रमांक": r.malmattaKramank || '',
      "घरकुल": r.gharkul || 'No',
      "पतीचे नाव": r.patiName || '',
      
      "मागील घरपट्टी": r.magilGharPatti || 0,
      "चालू घरपट्टी": r.chaluGharPatti || 0,
      "मागील दिवाबत्ती": r.magilDiwabatti || 0,
      "चालू दिवाबत्ती": r.chaluDiwabatti || 0,
      "मागील आरोग्य": r.magilArogya || 0,
      "चालू आरोग्य": r.chaluArogya || 0,
      "मागील पाणीपट्टी सामान्य": r.magilPanipattiSamanya || 0,
      "चालू पाणीपट्टी सामान्य": r.chaluPanipattiSamanya || 0,
      "मागील पाणीपट्टी विशेष": r.magilPanipattiVishesh || 0,
      "चालू पाणीपट्टी विशेष": r.chaluPanipattiVishesh || 0,
      "एकूण पाणीपट्टी विशेष": (r.magilPanipattiVishesh || 0) + (r.chaluPanipattiVishesh || 0),
      "मागील इतर": r.magilItar || 0,
      "चालू इतर": r.chaluItar || 0,
      
      "मागील घरपट्टी वसुली": r.magilGharPattiVasuli || 0,
      "चालू घरपट्टी वसुली": r.chaluGharPattiVasuli || 0,
      "मागील दिवाबत्ती वसुली": r.magilDiwabattiVasuli || 0,
      "चालू दिवाबत्ती वसुली": r.chaluDiwabattiVasuli || 0,
      "मागील आरोग्य वसुली": r.magilArogyaVasuli || 0,
      "चालू आरोग्य वसुली": r.chaluArogyaVasuli || 0,
      "मागील पाणीपट्टी वसुली": r.magilPanipattiVasuli || 0,
      "चालू पाणीपट्टी वसुली": r.chaluPanipattiVasuli || 0,
      "मागील इतर वसुली": r.magilItarVasuli || 0,
      "चालू इतर वसुली": r.chaluItarVasuli || 0,
      
      "शेरा": r.shera || '',
      "स्थिती": r.status || 'बाकी',
      "दिनांक": r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : ''
    }))

    const sheet = XLSX.utils.json_to_sheet(excelData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Namuna9')

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    })

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Namuna9.xlsx'
    )

    res.send(buffer)
  } catch (error) {
    next(error)
  }
}

// ════════════════════════════════════════════════════════════════
// ✅ NEW: GET /api/namuna9/download/bill?anukramank=101&previousYear=&currentYear=
// The "Excel Bill Filter" — same idea as the Namuna 9 page's Bill Filter
// (Start Row / Anukramank → Show Bill), but the output is a downloadable
// .xlsx workbook laid out like the paper Namuna 9(क) Demand Bill, with
// मूळ प्रत (Main Copy) and कार्बन प्रत (Carbon Copy) side-by-side —
// both identical, exactly like demand_bill.pdf.
// ════════════════════════════════════════════════════════════════
const buildBillBlockRows = (r, label) => {
  const panipattiVishesh = (r.magilPanipattiVishesh || 0) + (r.chaluPanipattiVishesh || 0)
  const magilKar = (r.magilGharPatti || 0) + (r.magilDiwabatti || 0) + (r.magilArogya || 0) + (r.magilPanipattiSamanya || 0) + (r.magilPanipattiVishesh || 0)
  const chaluKar = (r.chaluGharPatti || 0) + (r.chaluDiwabatti || 0) + (r.chaluArogya || 0) + (r.chaluPanipattiSamanya || 0) + (r.chaluPanipattiVishesh || 0)

  return [
    [label, '', '', ''],
    ['नमुना 9 (क), (नियम 32 (5) पहा)', '', '', ''],
    ['महाराष्ट्र ग्रामपंचायत (ग्रा.पं.) कायदा क्रमांक 129 प्रमाणे कर', '', '', ''],
    ['कर वसुली मागणी बिल', '', '', ''],
    [`ग्रामपंचायत कार्यालय ${r.panchayat || ''}${r.village ? ' (' + r.village + ')' : ''}`, '', '', ''],
    // ✅ पावती क्रमांक now shows the अनुक्रमांक value (see अनुक्रमांक row below too)
    [`वार्ड क्रं: ${r.wardKramank || '-'}`, `घर क्रं: ${r.malmattaKramank || '-'}`, `पावती क्रमांक: ${r.anukramank || '-'}`, ''],
    ['मालमत्ता धारकाचे नांव', r.gharMalakName || '', '', ''],
    ['भोगवटधारकाचे नांव', r.bhogvatadarName || 'स्वतः', '', ''],
    ['चालू कर सन', `${r.previousYear || ''}-${r.currentYear || ''}`, '', ''],
    ['अनुक्रमांक (पावती क्रमांक)', r.anukramank || '', '', ''],
    ['करांची नांवे', 'मागील कर', 'चालू कर', 'एकूण कर'],
    ['इमारत कर (घरपट्टी)', r.magilGharPatti || 0, r.chaluGharPatti || 0, (r.magilGharPatti || 0) + (r.chaluGharPatti || 0)],
    ['दिवाबत्ती कर', r.magilDiwabatti || 0, r.chaluDiwabatti || 0, (r.magilDiwabatti || 0) + (r.chaluDiwabatti || 0)],
    ['आरोग्य कर', r.magilArogya || 0, r.chaluArogya || 0, (r.magilArogya || 0) + (r.chaluArogya || 0)],
    ['सामान्य पाणीपट्टी कर', r.magilPanipattiSamanya || 0, r.chaluPanipattiSamanya || 0, (r.magilPanipattiSamanya || 0) + (r.chaluPanipattiSamanya || 0)],
    ['विशेष पाणीपट्टी कर', r.magilPanipattiVishesh || 0, r.chaluPanipattiVishesh || 0, panipattiVishesh],
    ['एकूण कर', magilKar, chaluKar, magilKar + chaluKar],
    ['', '', '', ''],
    ['वरील दर्शविलेली रकमेची सुचना मिळाल्यापासुन 15 दिवसाच्या आत कर भरणा करावा.', '', '', ''],
    [`दिनांक: ${new Date().toLocaleDateString('en-GB')}`, 'शिक्का', '', 'सरपंच / सचिव सही'],
  ]
}

const downloadNamuna9BillExcel = async (req, res, next) => {
  try {
    const { anukramank, previousYear, currentYear } = req.query
    if (!anukramank) {
      return next(new AppError('Bill साठी Anukramank आवश्यक आहे', 400))
    }

    const filter = buildFilter({ previousYear, currentYear, exactAnukramank: anukramank }, req.user)
    const record = await Namuna9.findOne(filter)
    if (!record) {
      return next(new AppError(`अनुक्रमांक ${anukramank} चा रेकॉर्ड सापडला नाही`, 404))
    }

    const mainRows = buildBillBlockRows(record, 'मूळ प्रत (MAIN COPY)')
    const carbonRows = buildBillBlockRows(record, 'कार्बन प्रत (CARBON COPY)')

    // Side by side: main = cols A-D (0-3), gap = col E (4), carbon = cols F-I (5-8)
    const aoa = mainRows.map((row, i) => [...row, '', ...carbonRows[i]])

    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    sheet['!cols'] = [
      { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 3 },
      { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ]
    // Merge the title/header rows across each 4-column block
    sheet['!merges'] = [0, 1, 2, 3].flatMap((rowIdx) => [
      { s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 3 } },
      { s: { r: rowIdx, c: 5 }, e: { r: rowIdx, c: 8 } },
    ])

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, `Bill_${anukramank}`)

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Disposition', `attachment; filename=DemandBill_Anukramank_${anukramank}.xlsx`)
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.send(buffer)
  } catch (error) {
    next(error)
  }
}

// ✅ NEW: Admin-only — distinct list of Grampanchayat names that currently
// have Namuna 9 records, used to populate the Namuna 9 page's
// "ग्रामपंचायत फिल्टर" dropdown. Non-admins never need this — they're
// hard-locked to their own Grampanchayat server-side.
const getNamuna9Panchayats = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin ग्रामपंचायत यादी पाहू शकतो', 403))
    }

    const panchayats = await Namuna9.distinct('panchayat')
    const cleaned = panchayats.filter((p) => p && p.trim()).sort((a, b) => a.localeCompare(b, 'mr'))

    res.status(200).json({
      success: true,
      count: cleaned.length,
      data: cleaned,
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  getAllNamuna9,
  getNamuna9ById,
  getNamuna9ByAnukramank,
  getNextAnukramank,
  createNamuna9,
  updateNamuna9,
  deleteNamuna9,
  fetchFromNamuna8,
  bulkSaveTax,
  downloadAllNamuna9,
  downloadMyNamuna9,
  exportNamuna9Excel,
  downloadNamuna9BillExcel,
  getNamuna9Panchayats,
}