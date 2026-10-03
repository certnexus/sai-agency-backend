const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const FILE_PATH = path.join(__dirname, '../data/gram_panchayat.xlsx');

const createExcelIfNotExist = () => {
  if (fs.existsSync(FILE_PATH)) {
    return;
  }

  const workbook = XLSX.utils.book_new();

  const usersData = [{
    'वापरकर्तानाव': '',
    'नाव': '',
    'ग्रामपंचायत': '',
    'गाव': '',
    'तालुका': '',
    'जिल्हा': '',
    'भूमिका': '',
    'Date': ''
  }];

  const namuna8Data = [{
    'Timestamp': '',
    'अ.क्र': '',
    'मा.क्र': '',
    'वॉर्ड क्र': '',
    'ग्रामपंचायत': '',
    'सामाविधि गाव': '',
    'तालुका': '',
    'जिल्हा': '',
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
    'क्षेत्रफळ चो.फुट': '',
    'क्षेत्रफळ चो.मी': '',
    'रे.रे.दर जमीन': '',
    'रे.रे.दर बांधकाम': '',
    'घसारा दर': '',
    'भांडवली मूल्य': '',
    'कर दर': '',
    'घरपट्टी कर (टेबल)': '',
    'Save Date': '',
    'Date': ''
  }];

  const namuna9Data = [{
    'अनुक्रमांक': '',
    'गाव': '',
    'ग्रामपंचायत': '',
    'कर सन': '',
    'घरमालकाचे नाव': '',
    'मालमत्ता क्रमांक': '',
    'वॉर्ड क्रमांक': '',
    'सर्वे नं.': '',
    'प्लॉट नं.': '',
    'मोबाईल नं.': '',
    'आधार क्रमांक': '',
    'घरकुल': '',
    'मागील घरपट्टी': '',
    'मागील दिवाबत्ती': '',
    'मागील आरोग्य': '',
    'मागील पाणीपट्टी सामान्य': '',
    'मागील पाणीपट्टी विशेष': '',
    'मागील इतर': '',
    'चालू घरपट्टी': '',
    'चालू दिवाबत्ती': '',
    'चालू आरोग्य': '',
    'चालू पाणीपट्टी सामान्य': '',
    'चालू पाणीपट्टी विशेष': '',
    'एकूण पाणीपट्टी विशेष': '',
    'चालू इतर': '',
    'मागील घरपट्टी वसूली': '',
    'मागील दिवाबत्ती वसूली': '',
    'मागील आरोग्य वसूली': '',
    'मागील पाणीपट्टी वसूली': '',
    'मागील इतर वसूली': '',
    'चालू घरपट्टी वसूली': '',
    'चालू दिवाबत्ती वसूली': '',
    'चालू आरोग्य वसूली': '',
    'चालू पाणीपट्टी वसूली': '',
    'चालू इतर वसूली': '',
    'एकूण कर': '',
    'एकूण वसूली': '',
    'बाकी रक्कम': '',
    'स्थिति': '',
    'शेरा': '',
    'Save Date': '',
    'Date': ''
  }];

  const usersSheet = XLSX.utils.json_to_sheet(usersData);
  const namuna8Sheet = XLSX.utils.json_to_sheet(namuna8Data);
  const namuna9Sheet = XLSX.utils.json_to_sheet(namuna9Data);

  XLSX.utils.book_append_sheet(workbook, usersSheet, 'Users');
  XLSX.utils.book_append_sheet(workbook, namuna8Sheet, 'Namuna8');
  XLSX.utils.book_append_sheet(workbook, namuna9Sheet, 'Namuna9');

  XLSX.writeFile(workbook, FILE_PATH);
  console.log('✅ Excel file created with all Marathi headers');
};

const getUniqueKey = (sheetName) => {
  const keys = {
    'Users': 'वापरकर्तानाव',
    'Namuna8': 'Timestamp',  // ✅ CHANGED: हर row को unique बनाने के लिए
    // ⚠️ FIX: अनुक्रमांक restarts from 1 in EVERY village, so using it
    // alone as the unique key meant Village A's #1 and Village B's #1
    // silently overwrote each other in this single shared workbook.
    // '_key' is a composite of village + tax-year + अनुक्रमांक instead.
    'Namuna9': '_key'
  };
  return keys[sheetName];
};

// Composite unique key for a Namuna9 Excel row — MUST be attached to
// every row passed to addDataToSheet('Namuna9', ...) as `_key`.
const namuna9RowKey = (village, previousYear, currentYear, anukramank) =>
  `${String(village || '').trim()}||${previousYear || ''}-${currentYear || ''}||${String(anukramank || '').trim()}`;

const addDataToSheet = (sheetName, data) => {
  try {
    createExcelIfNotExist();

    const workbook = XLSX.readFile(FILE_PATH);
    let sheet = workbook.Sheets[sheetName];
    let oldData = [];

    if (sheet) {
      oldData = XLSX.utils.sheet_to_json(sheet);
    }

    oldData = oldData.filter(
      (row) =>
        Object.values(row).some(
          (v) => v !== '' && v !== undefined && v !== null
        )
    );

    const uniqueKey = getUniqueKey(sheetName);
    const dataUniqueValue = data[uniqueKey];

    if (dataUniqueValue && uniqueKey !== 'Timestamp') {  // ✅ Timestamp के लिए unique check न करें
      const existingIndex = oldData.findIndex(
        (row) => {
          const rowValue = String(row[uniqueKey] || '').trim();
          const newValue = String(dataUniqueValue || '').trim();
          return rowValue === newValue;
        }
      );

      if (existingIndex !== -1) {
        console.log(`📝 Updating existing record in ${sheetName}: ${dataUniqueValue}`);
        oldData[existingIndex] = data;
      } else {
        console.log(`➕ Adding new record to ${sheetName}: ${dataUniqueValue}`);
        oldData.push(data);
      }
    } else {
      // ✅ Timestamp के लिए हमेशा नया row बनाएंगे
      console.log(`➕ Adding new record to ${sheetName}`);
      oldData.push(data);
    }

    // ✅ Keep the Namuna9 sheet always properly sequential: grouped by
    // गाव, then NUMERICALLY sorted by अनुक्रमांक within each village
    // (never lexicographic — "10" must sort after "9", not after "1").
    if (sheetName === 'Namuna9') {
      oldData.sort((a, b) => {
        const villageCmp = String(a['गाव'] || '').localeCompare(String(b['गाव'] || ''), 'mr')
        if (villageCmp !== 0) return villageCmp
        const na = parseInt(a['अ.क्र'] ?? a['अनुक्रमांक'], 10)
        const nb = parseInt(b['अ.क्र'] ?? b['अनुक्रमांक'], 10)
        if (isNaN(na) && isNaN(nb)) return 0
        if (isNaN(na)) return 1
        if (isNaN(nb)) return -1
        return na - nb
      })
    }

    const newSheet = XLSX.utils.json_to_sheet(oldData);
    workbook.Sheets[sheetName] = newSheet;

    XLSX.writeFile(workbook, FILE_PATH);
    console.log(`✅ Data saved to ${sheetName} sheet`);

  } catch (error) {
    console.error(`❌ Error in addDataToSheet for ${sheetName}:`, error.message);
  }
};

const saveUserToExcel = (user) => {
  try {
    addDataToSheet('Users', {
      'वापरकर्तानाव': user.username || '',
      'नाव': user.name || '',
      'ग्रामपंचायत': user.gramPanchayatName || '',
      'गाव': user.village || '',
      'तालुका': user.taluka || '',
      'जिल्हा': user.district || '',
      'भूमिका': user.role || '',
      'Date': new Date().toLocaleDateString('en-GB') || ''
    });
    console.log('✅ User saved/updated in Excel');
  } catch (error) {
    console.error('❌ Error saving user to Excel:', error);
  }
};

/**
 * ✅ FIXED: Multiple table rows support + TOTAL ROW
 * हर row को unique timestamp देता है
 */
const saveNamuna8ToExcel = (record) => {
  try {
    const f = record.fields || {};
    const d = record.directions || {};
    const t = record.taxInfo || {};
    const a = record.appealAndRemark || {};
    const rows = record.tableRows || [];

    let savedAtFormatted = '';
    if (record.savedAt) {
      savedAtFormatted = new Date(record.savedAt).toLocaleDateString('en-GB');
    }

    const baseFields = {
      'अ.क्र': f.serial || '',
      'मा.क्र': f.property || '',
      'वॉर्ड क्र': f.ward || '',
      'ग्रामपंचायत': f.panchayat || '',
      'सामाविधि गाव': f.village || '',
      'तालुका': f.taluka || '',
      'जिल्हा': f.district || '',
      // ✅ NEW FIELDS
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
      if (f.property) {
        addDataToSheet('Namuna8', {
          'Timestamp': new Date().getTime(),  // ✅ हर entry को unique timestamp
          ...baseFields,
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
          'Save Date': savedAtFormatted,
          'Date': new Date().toLocaleDateString('en-GB')
        });
      }
    } else {
      // ✅ Multiple rows case (possibly spanning multiple "New Table" groups)
      // - हर row को unique timestamp
      rows.forEach((row, index) => {
        if (!row.description || row.description.trim() === '') {
          console.log(`⏭️  Skipping empty row at index ${index}`);
          return;
        }

        // ✅ हर row को unique timestamp देता है
        const uniqueTimestamp = new Date().getTime() + index;

        addDataToSheet('Namuna8', {
          'Timestamp': uniqueTimestamp,  // ✅ UNIQUE!
          ...baseFields,
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
          'Save Date': savedAtFormatted,
          'Date': new Date().toLocaleDateString('en-GB')
        });
      });

      // ✅ TOTAL ROW add करो
      // क्षेत्रफळ (footprint) totals SKIP rows marked sameFootprint=true —
      // those are additional floors of a building already counted once, so
      // they must not inflate the total footprint area. भांडवली मूल्य and
      // घरपट्टी कर totals still SUM every row, since every floor is taxed
      // individually.
      const footprintRows = rows.filter((row) => !row.sameFootprint);
      const totalAreaSqft = footprintRows.reduce((sum, row) => sum + (parseFloat(row.areaSqft) || 0), 0);
      const totalAreaSqm = footprintRows.reduce((sum, row) => sum + (parseFloat(row.areaSqm) || 0), 0);
      const totalRentValue = rows.reduce((sum, row) => sum + (parseFloat(row.rentValue) || 0), 0);
      const totalGharpattiTax = rows.reduce((sum, row) => sum + (parseFloat(row.gharpattiTax) || 0), 0);

      addDataToSheet('Namuna8', {
        'Timestamp': new Date().getTime() + rows.length,  // ✅ TOTAL के लिए भी unique
        'ग्रामपंचायत': 'एकूण (Total)',
        'सामाविधि गाव': '',
        'तालुका': '',
        'जिल्हा': '',
        'अ.क्र': '',
        'मा.क्र': '',
        'वॉर्ड क्र': '',
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
        'Date': ''
      });
    }

    console.log('✅ Namuna8 saved/updated to Excel');

  } catch (error) {
    console.error('❌ Error saving Namuna8:', error);
  }
};

/**
 * ✅ saveNamuna9ToExcel
 */
const saveNamuna9ToExcel = (record) => {
  try {
    console.log(`📝 Saving Namuna9 for ${record.anukramank}...`);

    const totalTax =
      (record.magilGharPatti || 0) +
      (record.chaluGharPatti || 0) +
      (record.magilDiwabatti || 0) +
      (record.chaluDiwabatti || 0) +
      (record.magilArogya || 0) +
      (record.chaluArogya || 0) +
      (record.magilPanipattiSamanya || 0) +
      (record.chaluPanipattiSamanya || 0) +
      (record.magilPanipattiVishesh || 0) +
      (record.chaluPanipattiVishesh || 0) +
      (record.magilItar || 0) +
      (record.chaluItar || 0);

    const totalCollection =
      (record.magilGharPattiVasuli || 0) +
      (record.chaluGharPattiVasuli || 0) +
      (record.magilDiwabattiVasuli || 0) +
      (record.chaluDiwabattiVasuli || 0) +
      (record.magilArogyaVasuli || 0) +
      (record.chaluArogyaVasuli || 0) +
      (record.magilPanipattiVasuli || 0) +
      (record.chaluPanipattiVasuli || 0) +
      (record.magilItarVasuli || 0) +
      (record.chaluItarVasuli || 0);

    const pendingAmount = totalTax - totalCollection;

    let savedAtFormatted = '';
    if (record.savedAt) {
      const date = new Date(record.savedAt);
      savedAtFormatted = date.toLocaleDateString('en-GB');
    }

    addDataToSheet('Namuna9', {
      // ✅ Composite unique key — see namuna9RowKey() / getUniqueKey() above.
      '_key': namuna9RowKey(record.village, record.previousYear, record.currentYear, record.anukramank),
      'अनुक्रमांक': record.anukramank || '',
      'गाव': record.village || '',
      'ग्रामपंचायत': record.panchayat || '',
      'कर सन': `${record.previousYear || ''}-${record.currentYear || ''}`,
      'घरमालकाचे नाव': record.gharMalakName || '',
      'मालमत्ता क्रमांक': record.malmattaKramank || '',
      'वॉर्ड क्रमांक': record.wardKramank || '',
      'सर्वे नं.': record.sarveNo || '',
      'प्लॉट नं.': record.plotNo || '',
      'मोबाईल नं.': record.mobileNo || '',
      'आधार क्रमांक': record.aadharNo || '',
      'घरकुल': record.gharkul || 'No',
      'मागील घरपट्टी': record.magilGharPatti || 0,
      'मागील दिवाबत्ती': record.magilDiwabatti || 0,
      'मागील आरोग्य': record.magilArogya || 0,
      'मागील पाणीपट्टी': record.magilPanipattiSamanya || 0,
      'मागील इतर': record.magilItar || 0,
      'चालू घरपट्टी': record.chaluGharPatti || 0,
      'चालू दिवाबत्ती': record.chaluDiwabatti || 0,
      'चालू आरोग्य': record.chaluArogya || 0,
      'चालू पाणीपट्टी': record.chaluPanipattiSamanya || 0,
      'चालू इतर': record.chaluItar || 0,
      'मागील घरपट्टी वसूली': record.magilGharPattiVasuli || 0,
      'मागील दिवाबत्ती वसूली': record.magilDiwabattiVasuli || 0,
      'मागील आरोग्य वसूली': record.magilArogyaVasuli || 0,
      'मागील पाणीपट्टी वसूली': record.magilPanipattiVasuli || 0,
      'मागील इतर वसूली': record.magilItarVasuli || 0,
      'चालू घरपट्टी वसूली': record.chaluGharPattiVasuli || 0,
      'चालू दिवाबत्ती वसूली': record.chaluDiwabattiVasuli || 0,
      'चालू आरोग्य वसूली': record.chaluArogyaVasuli || 0,
      'चालू पाणीपट्टी वसूली': record.chaluPanipattiVasuli || 0,
      'चालू इतर वसूली': record.chaluItarVasuli || 0,
      'एकूण कर': totalTax.toFixed(2),
      'एकूण वसूली': totalCollection.toFixed(2),
      'बाकी रक्कम': pendingAmount.toFixed(2),
      'स्थिति': record.status || 'बाकी',
      'शेरा': record.shera || '',
      'Save Date': savedAtFormatted,
      'Date': new Date().toLocaleDateString('en-GB') || ''
    });

    console.log(`✅ Namuna9 saved/updated to Excel: ${record.anukramank}`);

  } catch (error) {
    console.error('❌ Error saving Namuna9 to Excel:', error);
  }
};

module.exports = {
  createExcelIfNotExist,
  saveUserToExcel,
  saveNamuna8ToExcel,
  saveNamuna9ToExcel,
};