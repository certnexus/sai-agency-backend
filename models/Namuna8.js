const mongoose = require('mongoose');

const tableRowSchema = new mongoose.Schema(
  {
    description: { type: String, default: '' },
    floor: { type: String, default: '' },
    yearConstructed: { type: String, default: '' },
    usage: { type: String, default: '' },
    lengthFt: { type: String, default: '' },
    widthFt: { type: String, default: '' },
    areaSqft: { type: String, default: '' },
    areaSqm: { type: String, default: '' },
    landRate: { type: String, default: '' },
    buildRate: { type: String, default: '' },
    depreciationRate: { type: String, default: '' },
    rentValue: { type: String, default: '' },
    taxRate: { type: String, default: '' },
    gharpattiTax: { type: String, default: '' },
    // ✅ NEW: "New Table" feature — identifies which table block (0, 1, 2...)
    // this row belongs to, so a single record can hold multiple independent
    // tables (e.g. multiple buildings on the same property).
    tableGroup: { type: Number, default: 0 },
    // ✅ NEW: Multi-floor footprint fix — when true, this row represents an
    // additional floor of the SAME building as the row(s) above it, so its
    // क्षेत्रफळ (area) must NOT be added again to the property's total
    // footprint (क्षेत्रफळ चो.फुट/चो.मी) even though it is still taxed
    // individually on its own area.
    sameFootprint: { type: Boolean, default: false },
  },
  { _id: false }
);

const masterRateSchema = new mongoose.Schema(
  {
    desc: { type: String, default: '' },
    landRate: { type: Number, default: 0 },
    buildRate: { type: Number, default: 0 },
    constructionRate: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
  },
  { _id: false }
);

const areaTaxRateSchema = new mongoose.Schema(
  {
    range: { type: String, default: '' },
    arogya: { type: Number, default: 0 },
    diwabatti: { type: Number, default: 0 },
  },
  { _id: false }
);

const depreciationRateSchema = new mongoose.Schema(
  {
    age: { type: String, default: '' },
    type1: { type: Number, default: 0 },
    type2: { type: Number, default: 0 },
  },
  { _id: false }
);

const namuna8Schema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    fields: {
      panchayat: { type: String, default: '' },
      village: { type: String, default: '' },
      taluka: { type: String, default: '' },
      district: { type: String, default: '' },
      ward: { type: String, default: '' },
      serial: { type: String, default: '' },
      property: { type: String, default: '' },
      // ✅ NEW FIELDS — added alongside अनुक्रमांक/मालमत्ता क्रमांक/वार्ड क्रमांक
      sarveNo: { type: String, default: '' },       // सर्वे नं.
      plotNo: { type: String, default: '' },         // प्लॉट नं.
      mobileNo: { type: String, default: '' },      // मोबाईल नं.
      aadharNo: { type: String, default: '' },       // आधार क्रमांक
      gharkul: { type: String, default: 'No' },      // घरकुल (Yes / No)
      owner: { type: String, default: '' },
      address: { type: String, default: '' },
      occupant: { type: String, default: '' },
      // ✅ NEW: Client-entered overall plot length × width (independent of table rows)
      plotLengthFt: { type: String, default: '' },
      plotWidthFt: { type: String, default: '' },
    },
    tableRows: {
      type: [tableRowSchema],
      default: [],
    },
    taxNotApply: {
      type: Boolean,
      default: false,
    },
    directions: {
      purv: { type: String, default: '' },
      paschim: { type: String, default: '' },
      uttar: { type: String, default: '' },
      dakshin: { type: String, default: '' },
    },
    taxInfo: {
      gharpatti: { type: String, default: '' },
      diwabatti: { type: String, default: '' },
      arogya: { type: String, default: '' },
      panipatti: { type: String, default: '' },
    },
    appealAndRemark: {
      gharpatti: { type: String, default: '' },
      diwabatti: { type: String, default: '' },
      arogya: { type: String, default: '' },
      panipatti: { type: String, default: '' },
      atikraman: { type: String, default: '' },
      remark: { type: String, default: '' },
      boja: { type: String, default: '' },
    },
    masterRates: {
      type: [masterRateSchema],
      default: [],
    },
    areaTaxRates: {
      type: [areaTaxRateSchema],
      default: [],
    },
    depreciationRates: {
      type: [depreciationRateSchema],
      default: [],
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

namuna8Schema.index({ 'fields.serial': 1 });
namuna8Schema.index({ 'fields.owner': 1 });
namuna8Schema.index({ 'fields.village': 1 });

namuna8Schema.methods.toSummaryJSON = function toSummaryJSON() {
  const f = this.fields || {};
  const t = this.taxInfo || {};
  const a = this.appealAndRemark || {};

  return {
    id: this._id,
    anukramank: f.serial || '',
    gharMalakName: f.owner || '',
    bhogvatadarName: f.occupant || '',
    malmattaKramank: f.property || '',
    wardKramank: f.ward || '',
    sarveNo: f.sarveNo || '',
    plotNo: f.plotNo || '',
    mobileNo: f.mobileNo || '',
    aadharNo: f.aadharNo || '',
    gharkul: f.gharkul || 'No',
    panchayat: f.panchayat || '',
    village: f.village || '',
    taluka: f.taluka || '',
    district: f.district || '',
    gharpatti: Number(t.gharpatti) || 0,
    diwabatti: Number(t.diwabatti) || 0,
    arogya: Number(t.arogya) || 0,
    panipatti: Number(t.panipatti) || 0,
    atikraman: a.atikraman || '',
    savedAt: this.savedAt,
  };
};

namuna8Schema.methods.toPeopleListJSON = function toPeopleListJSON() {
  const summary = this.toSummaryJSON();
  return {
    id: summary.id,
    serial: summary.anukramank,
    property: summary.malmattaKramank,
    ward: summary.wardKramank,
    village: summary.village,
    owner: summary.gharMalakName,
    occupant: summary.bhogvatadarName,
    sarveNo: summary.sarveNo,
    plotNo: summary.plotNo,
    mobileNo: summary.mobileNo,
    aadharNo: summary.aadharNo,
    gharkul: summary.gharkul,
    panchayat: summary.panchayat,
    taluka: summary.taluka,
    district: summary.district,
    gharpatti: summary.gharpatti,
    diwabatti: summary.diwabatti,
    arogya: summary.arogya,
    panipatti: summary.panipatti,
    atikraman: summary.atikraman,
  };
};

module.exports = mongoose.model('Namuna8', namuna8Schema);