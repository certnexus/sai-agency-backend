const Namuna8 = require('../models/Namuna8');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { saveNamuna8ToExcel } = require('../utils/excelManager');
const { getOrCreateSettings } = require('./settingsController');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// ✅ Grampanchayat-wise scoping: builds the Mongo filter for a request.
// - A logged-in `user` (non-admin) is always hard-locked to their OWN
//   Grampanchayat (`fields.panchayat` matched against `user.gramPanchayatName`)
//   — this can NOT be overridden by a `?panchayat=` query param, so one
//   Grampanchayat user never sees another Grampanchayat's People List /
//   Namuna 8 data.
// - An `admin` sees every Grampanchayat by default, but can still narrow
//   the list down via `?panchayat=...` (the Global filter dropdown).
// - If no user is attached to the request (e.g. legacy/unauthenticated
//   calls) the filter falls back to whatever `panchayat` query param (if
//   any) was passed, preserving old behaviour.
const buildFilter = (query, user) => {
  const filter = {};

  if (query.serial) {
    filter['fields.serial'] = { $regex: query.serial, $options: 'i' };
  }
  if (query.name) {
    filter.$or = [
      { 'fields.owner': { $regex: query.name, $options: 'i' } },
      { 'fields.occupant': { $regex: query.name, $options: 'i' } },
    ];
  }
  if (query.village) {
    filter['fields.village'] = { $regex: query.village, $options: 'i' };
  }

  if (user && user.role !== 'admin') {
    // Non-admins are hard-locked to their own Grampanchayat.
    filter['fields.panchayat'] = user.gramPanchayatName || '';
  } else if (query.panchayat) {
    // Admins (or unauthenticated legacy calls) may optionally filter.
    filter['fields.panchayat'] = { $regex: query.panchayat, $options: 'i' };
  }

  return filter;
};

const getAllNamuna8 = async (req, res, next) => {
  try {
    const filter = buildFilter(req.query, req.user);
    const records = await Namuna8.find(filter).sort({ createdAt: -1 });

    const summary = records.map((r) => r.toSummaryJSON());

    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

const getPeopleList = async (req, res, next) => {
  try {
    const filter = {
      ...buildFilter(req.query, req.user),
      'fields.serial': { $exists: true, $ne: '' },
    };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      Namuna8.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Namuna8.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: records.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      // ✅ Tells the frontend whether it is looking at "everything" (admin)
      // or a single Grampanchayat, and which one, so PeopleList.jsx can
      // show the right banner / global filter.
      scope: {
        isAdmin: !!(req.user && req.user.role === 'admin'),
        gramPanchayatName: req.user && req.user.role !== 'admin' ? (req.user.gramPanchayatName || '') : null,
      },
      data: records.map((r) => r.toPeopleListJSON()),
    });
  } catch (error) {
    next(error);
  }
};

const getNamuna8ById = async (req, res, next) => {
  try {
    const record = await Namuna8.findById(req.params.id);

    if (!record) {
      return next(new AppError('Namuna 8 record not found', 404));
    }

    res.status(200).json({
      success: true,
      data: {
        id: record._id,
        fields: record.fields,
        tableRows: record.tableRows,
        taxNotApply: record.taxNotApply,
        directions: record.directions,
        taxInfo: record.taxInfo,
        appealAndRemark: record.appealAndRemark,
        masterRates: record.masterRates,
        areaTaxRates: record.areaTaxRates,
        depreciationRates: record.depreciationRates,
        savedAt: record.savedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createNamuna8 = async (req, res, next) => {
  try {
    const {
      fields,
      tableRows,
      taxNotApply,
      directions,
      taxInfo,
      appealAndRemark,
      masterRates,
      areaTaxRates,
      depreciationRates,
    } = req.body;

    // ✅ If the client didn't send rate tables, fall back to the saved global
    // Settings from MongoDB (never to hardcoded values) so every new property
    // calculation always uses the values the user saved earlier.
    let settings = null;
    if (!masterRates?.length || !areaTaxRates?.length || !depreciationRates?.length) {
      settings = await getOrCreateSettings();
    }

    // ✅ Grampanchayat-wise data separation: a logged-in non-admin user's
    // records are always filed under THEIR OWN Grampanchayat, regardless of
    // what the form sent — this is what keeps their People List / Excel /
    // PDF scoped correctly and stops one Grampanchayat's data leaking into
    // another's exports. Admins (or unauthenticated legacy calls) keep
    // whatever panchayat value the form/body sent.
    const scopedFields = { ...(fields || {}) };
    if (req.user && req.user.role !== 'admin') {
      scopedFields.panchayat = req.user.gramPanchayatName || '';
    }

    // ✅ अनुक्रमांक uniqueness per Gram Panchayat (same rule as Namuna 9)
    const serialToCheck = String(scopedFields.serial || '').trim();
    const panchayatToCheck = String(scopedFields.panchayat || '').trim();
    if (serialToCheck) {
      const dupFilter = {
        'fields.serial': serialToCheck,
      };
      if (panchayatToCheck) {
        dupFilter['fields.panchayat'] = panchayatToCheck;
      }
      const existing = await Namuna8.findOne(dupFilter);
      if (existing) {
        return next(
          new AppError('अनुक्रमांक आधीच अस्तित्वात आहे. कृपया दुसरा अनुक्रमांक द्या.', 400)
        );
      }
    }

    const record = await Namuna8.create({
      createdBy: req.user?._id,
      fields: scopedFields,
      tableRows: tableRows || [],
      taxNotApply: taxNotApply || false,
      directions: directions || {},
      taxInfo: taxInfo || {},
      appealAndRemark: appealAndRemark || {},
      masterRates: masterRates?.length ? masterRates : settings.masterRates,
      areaTaxRates: areaTaxRates?.length ? areaTaxRates : settings.areaTaxRates,
      depreciationRates: depreciationRates?.length ? depreciationRates : settings.depreciationRates,
      savedAt: new Date(),
    });

    await saveNamuna8ToExcel(record);

    res.status(201).json({
      success: true,
      message: 'Namuna 8 record created successfully',
      data: {
        id: record._id,
        ...record.toObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateNamuna8 = async (req, res, next) => {
  try {
    const record = await Namuna8.findById(req.params.id);

    if (!record) {
      return next(new AppError('Namuna 8 record not found', 404));
    }

    // ✅ Grampanchayat-wise data separation: a non-admin can only edit
    // records that already belong to their own Grampanchayat.
    if (req.user && req.user.role !== 'admin') {
      const recordPanchayat = record.fields?.panchayat || '';
      if (recordPanchayat !== (req.user.gramPanchayatName || '')) {
        return next(new AppError('तुम्ही फक्त तुमच्या ग्रामपंचायतीचा रेकॉर्ड edit करू शकता', 403));
      }
    }

    const allowedFields = [
      'fields',
      'tableRows',
      'taxNotApply',
      'directions',
      'taxInfo',
      'appealAndRemark',
      'masterRates',
      'areaTaxRates',
      'depreciationRates',
    ];

        allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        record[field] = req.body[field];
      }
    });

    // ✅ Non-admins can't move a record to a different Grampanchayat.
    if (req.user && req.user.role !== 'admin' && record.fields) {
      record.fields.panchayat = req.user.gramPanchayatName || '';
    }

    // ✅ अनुक्रमांक uniqueness per Gram Panchayat on update (exclude self)
    const serialToCheck = String(record.fields?.serial || '').trim();
    const panchayatToCheck = String(record.fields?.panchayat || '').trim();
    if (serialToCheck) {
      const dupFilter = {
        _id: { $ne: record._id },
        'fields.serial': serialToCheck,
      };
      if (panchayatToCheck) {
        dupFilter['fields.panchayat'] = panchayatToCheck;
      }
      const existing = await Namuna8.findOne(dupFilter);
      if (existing) {
        return next(
          new AppError('अनुक्रमांक आधीच अस्तित्वात आहे. कृपया दुसरा अनुक्रमांक द्या.', 400)
        );
      }
    }

    record.savedAt = new Date();
    await record.save();

    await saveNamuna8ToExcel(record);

    res.status(200).json({
      success: true,
      message: 'Namuna 8 record updated successfully',
      data: {
        id: record._id,
        ...record.toObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteNamuna8 = async (req, res, next) => {
  try {
    const record = await Namuna8.findByIdAndDelete(req.params.id);

    if (!record) {
      return next(new AppError('Namuna 8 record not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Namuna 8 record deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const searchNamuna8 = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      return next(new AppError('Search query (q) is required', 400));
    }

    const searchFilter = {
      $or: [
        { 'fields.serial': { $regex: q, $options: 'i' } },
        { 'fields.owner': { $regex: q, $options: 'i' } },
        { 'fields.occupant': { $regex: q, $options: 'i' } },
      ],
    };

    // ✅ Non-admins only search within their own Grampanchayat.
    if (req.user && req.user.role !== 'admin') {
      searchFilter['fields.panchayat'] = req.user.gramPanchayatName || '';
    }

    const records = await Namuna8.find(searchFilter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records.map((r) => r.toSummaryJSON()),
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// 📥 DOWNLOAD FUNCTIONS - FIXED VERSION
// ============================================

const downloadAllNamuna8 = async (req, res, next) => {
  try {
    // ✅ This export spans EVERY Grampanchayat — must stay admin-only, or
    // any logged-in Grampanchayat user could download every other
    // Grampanchayat's data too.
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin सर्व ग्रामपंचायतींचा डेटा डाउनलोड करू शकतो', 403));
    }

    const records = await Namuna8.find();

    // ✅ FIXED: same proper format as "My Records" download — one Excel row
    // PER PROPERTY DESCRIPTION LINE (tableRows), with every field (basic
    // info, directions, taxes, appeal/remark AND the row-level valuation
    // fields), plus a single Total row at the end. Previously this admin
    // export only listed one summary line per record and dropped all
    // tableRows / valuation data entirely.
    const excelData = [];

    records.forEach((record) => {
      const f = record.fields || {};
      const d = record.directions || {};
      const t = record.taxInfo || {};
      const a = record.appealAndRemark || {};
      const rows = record.tableRows || [];

      const baseRow = {
        'अ.क्र': f.serial || '',
        'मा.क्र': f.property || '',
        'वॉर्ड क्र': f.ward || '',
        'ग्रामपंचायत': f.panchayat || '',
        'सामाविधि गाव': f.village || '',
        'तालुका': f.taluka || '',
        'जिल्हा': f.district || '',
        'सर्वे नं.': f.sarveNo || '',
        'प्लॉट नं.': f.plotNo || '',
        'मोबाईल नं.': f.mobileNo || '',
        'आधार क्रमांक': f.aadharNo || '',
        'घरकुल': f.gharkul || 'No',
        'घरमालकाचे नाव': f.owner || '',
        'पत्नीचे नाव': f.address || '',
        'भोगवटदाराचे नाव': f.occupant || '',
        'पूर्व': d.purv || '',
        'पश्चिम': d.paschim || '',
        'उत्तर': d.uttar || '',
        'दक्षिण': d.dakshin || '',
        'घरपट्टी कर': t.gharpatti || '',
        'दिवाबत्ती कर': t.diwabatti || '',
        'आरोग्य कर': t.arogya || '',
        'पाणीपट्टी कर': t.panipatti || '',
        'अपील घरपट्टी': a.gharpatti || '',
        'अपील दिवाबत्ती': a.diwabatti || '',
        'अपील आरोग्य': a.arogya || '',
        'अपील पाणीपट्टी': a.panipatti || '',
        'अतिक्रमणाचे क्षेत्रफळ': a.atikraman || '',
        'शेरा': a.remark || '',
        'बोझा': a.boja || '',
      };

      if (rows.length === 0) {
        excelData.push({
          ...baseRow,
          'टेबल क्र': '',
          'मालाचे वर्णन': '',
          'मजला': '',
          'बांधकाम वर्ष': '',
          'वापर': '',
          'लांबी फुट': '',
          'रुंदी फुट': '',
          'क्षेत्रफळ चो.फुट': '',
          'क्षेत्रफळ चो.मी': '',
          'रे.रे.दर जमीन': '',
          'रे.रे.दर बांधकाम': '',
          'घसारा दर': '',
          'भांडवली मूल्य': '',
          'कर दर': '',
          'घरपट्टी कर (टेबल)': '',
          'Save Date': record.savedAt ? new Date(record.savedAt).toLocaleDateString('en-GB') : '',
        });
      } else {
        rows.forEach((row) => {
          excelData.push({
            ...baseRow,
            'टेबल क्र': (Number(row.tableGroup) || 0) + 1,
            'मालाचे वर्णन': row.description || '',
            'मजला': row.floor || '',
            'बांधकाम वर्ष': row.yearConstructed || '',
            'वापर': row.usage || '',
            'लांबी फुट': row.lengthFt || '',
            'रुंदी फुट': row.widthFt || '',
            // ✅ Footprint fix: multi-floor rows sharing the same footprint
            // (row.sameFootprint === true) are excluded from the area columns
            // used for TOTAL summation below by marking them here; the raw
            // per-row area is still shown for reference.
            'क्षेत्रफळ चो.फुट': row.areaSqft || '',
            'क्षेत्रफळ चो.मी': row.areaSqm || '',
            'रे.रे.दर जमीन': row.landRate || '',
            'रे.रे.दर बांधकाम': row.buildRate || '',
            'घसारा दर': row.depreciationRate || '',
            'भांडवली मूल्य': row.rentValue || '',
            'कर दर': row.taxRate || '',
            'घरपट्टी कर (टेबल)': row.gharpattiTax || '',
            '_sameFootprint': !!row.sameFootprint,
            'Save Date': record.savedAt ? new Date(record.savedAt).toLocaleDateString('en-GB') : '',
          });
        });
      }
    });

    // ✅ Grand Total row across ALL users/records
    // क्षेत्रफळ totals skip rows flagged sameFootprint (extra floors of a
    // building already counted once); भांडवली मूल्य / घरपट्टी कर still sum
    // every row since each floor is taxed individually.
    const totalAreaSqft = excelData.reduce(
      (sum, row) => sum + (row._sameFootprint ? 0 : (parseFloat(row['क्षेत्रफळ चो.फुट']) || 0)), 0
    );
    const totalAreaSqm = excelData.reduce(
      (sum, row) => sum + (row._sameFootprint ? 0 : (parseFloat(row['क्षेत्रफळ चो.मी']) || 0)), 0
    );
    const totalRentValue = excelData.reduce(
      (sum, row) => sum + (parseFloat(row['भांडवली मूल्य']) || 0), 0
    );
    const totalGharpattiTax = excelData.reduce(
      (sum, row) => sum + (parseFloat(row['घरपट्टी कर (टेबल)']) || 0), 0
    );

    // ✅ Strip the internal helper column before writing to Excel
    excelData.forEach((row) => { delete row._sameFootprint; });

    excelData.push({
      'ग्रामपंचायत': 'एकूण (Total)',
      'सामाविधि गाव': '',
      'तालुका': '',
      'जिल्हा': '',
      'वॉर्ड क्र': '',
      'अ.क्र': '',
      'मा.क्र': '',
      'सर्वे नं.': '',
      'प्लॉट नं.': '',
      'मोबाईल नं.': '',
      'आधार क्रमांक': '',
      'घरकुल': '',
      'घरमालकाचे नाव': '',
      'पत्नीचे नाव': '',
      'भोगवटदाराचे नाव': '',
      'पूर्व': '',
      'पश्चिम': '',
      'उत्तर': '',
      'दक्षिण': '',
      'घरपट्टी कर': '',
      'दिवाबत्ती कर': '',
      'आरोग्य कर': '',
      'पाणीपट्टी कर': '',
      'अपील घरपट्टी': '',
      'अपील दिवाबत्ती': '',
      'अपील आरोग्य': '',
      'अपील पाणीपट्टी': '',
      'अतिक्रमणाचे क्षेत्रफळ': '',
      'शेरा': '',
      'बोझा': '',
      'टेबल क्र': '',
      'मालाचे वर्णन': '',
      'मजला': '',
      'बांधकाम वर्ष': '',
      'वापर': '',
      'लांबी फुट': '',
      'रुंदी फुट': '',
      'क्षेत्रफळ चो.फुट': totalAreaSqft.toFixed(2),
      'क्षेत्रफळ चो.मी': totalAreaSqm.toFixed(2),
      'रे.रे.दर जमीन': '',
      'रे.रे.दर बांधकाम': '',
      'घसारा दर': '',
      'भांडवली मूल्य': totalRentValue.toFixed(2),
      'कर दर': '',
      'घरपट्टी कर (टेबल)': totalGharpattiTax.toFixed(2),
      'Save Date': '',
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Namuna8");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=Namuna8_All.xlsx");
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (error) {
    console.error('Download error:', error);
    next(error);
  }
};

/**
 * ✅ FIXED: downloadMyNamuna8
 * 1. File को backend/data में save करो
 * 2. Buffer से download भी करो
 * 3. File persistence के लिए backend में भी रहे
 */
const downloadMyNamuna8 = async (req, res, next) => {
  try {
    // ✅ Grampanchayat-wise export: this is a shared Grampanchayat register
    // (like the paper दप्तर), not a per-user private list — every user
    // from the same Grampanchayat must see the same rows. Admins get
    // every Grampanchayat.
    const filter = req.user.role === 'admin'
      ? {}
      : { 'fields.panchayat': req.user.gramPanchayatName || '' };

    const records = await Namuna8.find(filter);

    console.log(`📥 User ${req.user.username} (Grampanchayat: ${req.user.gramPanchayatName}) साठी ${records.length} Namuna8 records`);

    const excelData = [];

    records.forEach((record) => {
      const f = record.fields || {};
      const d = record.directions || {};
      const t = record.taxInfo || {};
      const a = record.appealAndRemark || {};
      const rows = record.tableRows || [];

      const baseRowMy = {
        'अ.क्र': f.serial || '',
        'मा.क्र': f.property || '',
        'वॉर्ड क्र': f.ward || '',
        'ग्रामपंचायत': f.panchayat || '',
        'सामाविधि गाव': f.village || '',
        'तालुका': f.taluka || '',
        'जिल्हा': f.district || '',
        'सर्वे नं.': f.sarveNo || '',
        'प्लॉट नं.': f.plotNo || '',
        'मोबाईल नं.': f.mobileNo || '',
        'आधार क्रमांक': f.aadharNo || '',
        'घरकुल': f.gharkul || 'No',
        'घरमालकाचे नाव': f.owner || '',
        'पत्नीचे नाव': f.address || '',
        'भोगवटदाराचे नाव': f.occupant || '',
        'पूर्व': d.purv || '',
        'पश्चिम': d.paschim || '',
        'उत्तर': d.uttar || '',
        'दक्षिण': d.dakshin || '',
        'घरपट्टी कर': t.gharpatti || '',
        'दिवाबत्ती कर': t.diwabatti || '',
        'आरोग्य कर': t.arogya || '',
        'पाणीपट्टी कर': t.panipatti || '',
        'अपील घरपट्टी': a.gharpatti || '',
        'अपील दिवाबत्ती': a.diwabatti || '',
        'अपील आरोग्य': a.arogya || '',
        'अपील पाणीपट्टी': a.panipatti || '',
        'अतिक्रमणाचे क्षेत्रफळ': a.atikraman || '',
        'शेरा': a.remark || '',
        'बोझा': a.boja || '',
      };

      if (rows.length === 0) {
        excelData.push({
          ...baseRowMy,
          'टेबल क्र': '',
          'मालाचे वर्णन': '',
          'मजला': '',
          'बांधकाम वर्ष': '',
          'वापर': '',
          'लांबी फुट': '',
          'रुंदी फुट': '',
          'क्षेत्रफळ चो.फुट': '',
          'क्षेत्रफळ चो.मी': '',
          'रे.रे.दर जमीन': '',
          'रे.रे.दर बांधकाम': '',
          'घसारा दर': '',
          'भांडवली मूल्य': '',
          'कर दर': '',
          'घरपट्टी कर (टेबल)': '',
          'Save Date': record.savedAt ? new Date(record.savedAt).toLocaleDateString('en-GB') : '',
        });
      } else {
        rows.forEach((row) => {
          excelData.push({
            ...baseRowMy,
            'टेबल क्र': (Number(row.tableGroup) || 0) + 1,
            'मालाचे वर्णन': row.description || '',
            'मजला': row.floor || '',
            'बांधकाम वर्ष': row.yearConstructed || '',
            'वापर': row.usage || '',
            'लांबी फुट': row.lengthFt || '',
            'रुंदी फुट': row.widthFt || '',
            'क्षेत्रफळ चो.फुट': row.areaSqft || '',
            'क्षेत्रफळ चो.मी': row.areaSqm || '',
            'रे.रे.दर जमीन': row.landRate || '',
            'रे.रे.दर बांधकाम': row.buildRate || '',
            'घसारा दर': row.depreciationRate || '',
            'भांडवली मूल्य': row.rentValue || '',
            'कर दर': row.taxRate || '',
            'घरपट्टी कर (टेबल)': row.gharpattiTax || '',
            '_sameFootprint': !!row.sameFootprint,
            'Save Date': record.savedAt ? new Date(record.savedAt).toLocaleDateString('en-GB') : '',
          });
        });
      }
    });
// ✅ USER SPECIFIC TOTAL ROW
// क्षेत्रफळ totals skip rows flagged sameFootprint (extra floors of a
// building already counted once); भांडवली मूल्य / घरपट्टी कर still sum
// every row since each floor is taxed individually.
const totalAreaSqft = excelData.reduce(
  (sum, row) => sum + (row._sameFootprint ? 0 : (parseFloat(row['क्षेत्रफळ चो.फुट']) || 0)),
  0
);

const totalAreaSqm = excelData.reduce(
  (sum, row) => sum + (row._sameFootprint ? 0 : (parseFloat(row['क्षेत्रफळ चो.मी']) || 0)),
  0
);

const totalRentValue = excelData.reduce(
  (sum, row) => sum + (parseFloat(row['भांडवली मूल्य']) || 0),
  0
);

const totalGharpattiTax = excelData.reduce(
  (sum, row) => sum + (parseFloat(row['घरपट्टी कर (टेबल)']) || 0),
  0
);

// ✅ Strip internal helper column before writing to Excel
excelData.forEach((row) => { delete row._sameFootprint; });

excelData.push({
  'ग्रामपंचायत': 'एकूण (Total)',
  'सामाविधि गाव': '',
  'तालुका': '',
  'जिल्हा': '',
  'वॉर्ड क्र': '',
  'अ.क्र': '',
  'मा.क्र': '',
  'सर्वे नं.': '',
  'प्लॉट नं.': '',
  'मोबाईल नं.': '',
  'आधार क्रमांक': '',
  'घरकुल': '',
  'घरमालकाचे नाव': '',
  'पत्नीचे नाव': '',
  'भोगवटदाराचे नाव': '',
  'पूर्व': '',
  'पश्चिम': '',
  'उत्तर': '',
  'दक्षिण': '',
  'घरपट्टी कर': '',
  'दिवाबत्ती कर': '',
  'आरोग्य कर': '',
  'पाणीपट्टी कर': '',
  'अपील घरपट्टी': '',
  'अपील दिवाबत्ती': '',
  'अपील आरोग्य': '',
  'अपील पाणीपट्टी': '',
  'अतिक्रमणाचे क्षेत्रफळ': '',
  'शेरा': '',
  'बोझा': '',
  'टेबल क्र': '',
  'मालाचे वर्णन': '',
  'मजला': '',
  'बांधकाम वर्ष': '',
  'वापर': '',
  'लांबी फुट': '',
  'रुंदी फुट': '',
  'क्षेत्रफळ चो.फुट': totalAreaSqft.toFixed(2),
  'क्षेत्रफळ चो.मी': totalAreaSqm.toFixed(2),
  'रे.रे.दर जमीन': '',
  'रे.रे.दर बांधकाम': '',
  'घसारा दर': '',
  'भांडवली मूल्य': totalRentValue.toFixed(2),
  'कर दर': '',
  'घरपट्टी कर (टेबल)': totalGharpattiTax.toFixed(2),
  'Save Date': '',
});
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Namuna8');

    // ✅ STEP 1: File को backend/data में save करो
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const filePath = path.join(dataDir, `namuna8_${req.user._id}.xlsx`);
    XLSX.writeFile(wb, filePath);
    console.log(`✅ User Namuna8 file saved: ${filePath}`);

    // ✅ STEP 2: Buffer से download भी करो (file backend में persist रहेगी)
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    
    res.setHeader("Content-Disposition", "attachment; filename=Namuna8_MyRecords.xlsx");
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);

  } catch (error) {
    console.error('Download My Namuna8 error:', error);
    next(error);
  }
};

// ✅ NEW: Admin-only — distinct list of Grampanchayat names that currently
// have Namuna 8 records, used to populate the "Global filter (Grampanchayat
// wise)" dropdown on the People List page. Non-admins never need this
// (they're hard-locked to their own Grampanchayat), so this is admin-only.
const getGramPanchayatList = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin सर्व ग्रामपंचायतींची यादी पाहू शकतो', 403));
    }

    const panchayats = await Namuna8.distinct('fields.panchayat');
    const cleaned = panchayats.filter((p) => p && p.trim()).sort((a, b) => a.localeCompare(b, 'mr'));

    res.status(200).json({
      success: true,
      data: cleaned,
    });
  } catch (error) {
    next(error);
  }
};

const downloadGramPanchayatFile = async (req, res, next) => {
  try {
    // ✅ This background file combines EVERY Grampanchayat's data —
    // admin-only, same as downloadAllNamuna8.
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin सर्व ग्रामपंचायतींची फाईल डाउनलोड करू शकतो', 403));
    }

    const filePath = path.join(__dirname, '../data/gram_panchayat.xlsx');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false,
        message: 'Gram Panchayat file not found. Pehle kuch entries create karo.' 
      });
    }

    res.download(filePath, 'gram_panchayat.xlsx');
  } catch (error) {
    console.error('Gram Panchayat File Download Error:', error);
    next(error);
  }
};

module.exports = {
  getAllNamuna8,
  getPeopleList,
  getNamuna8ById,
  createNamuna8,
  updateNamuna8,
  deleteNamuna8,
  searchNamuna8,
  downloadAllNamuna8,
  downloadMyNamuna8,
  downloadGramPanchayatFile,
  getGramPanchayatList,
};