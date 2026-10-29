const mongoose = require('mongoose');

const namuna9Schema = new mongoose.Schema(
  {
    namuna8Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Namuna8',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    previousYear: {
      type: String,
      default: '2019',
    },
    currentYear: {
      type: String,
      default: '2020',
    },
    anukramank: {
      type: String,
      default: '',
    },
    malmattaKramank: {
      type: String,
      default: '',
    },
    wardKramank: {
      type: String,
      default: '',
    },
    // ✅ NEW FIELDS — fetched from Namuna8, shown in Namuna 9 for full
    // property identification alongside अनुक्रमांक/मालमत्ता क्रमांक/वार्ड क्र
    // (no longer editable/shown on the Namuna 9 screen itself, but kept on
    // the model since they still arrive from Namuna 8 sync and are useful
    // for the Demand Bill / other reports.)
    sarveNo: { type: String, default: '' },
    plotNo: { type: String, default: '' },
    mobileNo: { type: String, default: '' },
    aadharNo: { type: String, default: '' },
    gharkul: { type: String, default: 'No' },
    // ✅ Demand Bill receipt number ("पावती क्र.") — printed on the Namuna 9(क)
    // कर वसुली मागणी बिल (Main Copy + Carbon Copy).
    pavatiKramank: { type: String, default: '' },
    // ✅ Multi-village support — every record is stamped with the village
    // (and panchayat/taluka/district) of the user who owns it, so each
    // gram panchayat user only ever sees/edits their own village's data.
    village: { type: String, default: '', trim: true },
    panchayat: { type: String, default: '', trim: true },
    taluka: { type: String, default: '', trim: true },
    district: { type: String, default: '', trim: true },
    gharMalakName: {
      type: String,
      default: '',
    },
    patiName: {
      type: String,
      default: '',
    },
    bhogvatadarName: {
      type: String,
      default: '',
    },
    magilGharPatti: { type: Number, default: 0 },
    chaluGharPatti: { type: Number, default: 0 },
    magilDiwabatti: { type: Number, default: 0 },
    chaluDiwabatti: { type: Number, default: 0 },
    magilArogya: { type: Number, default: 0 },
    chaluArogya: { type: Number, default: 0 },
    // ✅ RENAMED (मागील/चालू पाणीपट्टी → ...सामान्य) + 2 NEW विशेष fields +
    // 1 calculated total. See toResponseJSON()'s fallback below — it
    // reads the deprecated magilPanipatti/chaluPanipatti fields further
    // down for any document saved before this rename, so no historical
    // data is lost.
    magilPanipattiSamanya: { type: Number, default: 0 },
    chaluPanipattiSamanya: { type: Number, default: 0 },
    magilPanipattiVishesh: { type: Number, default: 0 },
    chaluPanipattiVishesh: { type: Number, default: 0 },
    magilItar: { type: Number, default: 0 },
    chaluItar: { type: Number, default: 0 },
    magilGharPattiVasuli: { type: Number, default: 0 },
    chaluGharPattiVasuli: { type: Number, default: 0 },
    magilDiwabattiVasuli: { type: Number, default: 0 },
    chaluDiwabattiVasuli: { type: Number, default: 0 },
    magilArogyaVasuli: { type: Number, default: 0 },
    chaluArogyaVasuli: { type: Number, default: 0 },
    magilPanipattiVasuli: { type: Number, default: 0 },
    chaluPanipattiVasuli: { type: Number, default: 0 },
    magilItarVasuli: { type: Number, default: 0 },
    chaluItarVasuli: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['बाकी', 'भरले', 'रद्द'],
      default: 'बाकी',
    },
    shera: {
      type: String,
      default: '',
    },
    // ⚠️ DEPRECATED — pre-rename पाणीपट्टी सामान्य fields, kept ONLY so
    // documents saved before this rename still have their old data
    // readable (see toResponseJSON()'s fallback). Never written to by
    // any code path anymore.
    magilPanipatti: { type: Number, default: undefined },
    chaluPanipatti: { type: Number, default: undefined },
  },
  {
    timestamps: true,
  }
);

namuna9Schema.index({ anukramank: 1 });
namuna9Schema.index({ gharMalakName: 1 });
namuna9Schema.index({ previousYear: 1, currentYear: 1 });
namuna9Schema.index({ village: 1 });

namuna9Schema.methods.toResponseJSON = function toResponseJSON() {
  return {
    id: this._id,
    namuna8Id: this.namuna8Id,
    previousYear: this.previousYear,
    currentYear: this.currentYear,
    anukramank: this.anukramank,
    malmattaKramank: this.malmattaKramank,
    wardKramank: this.wardKramank,
    sarveNo: this.sarveNo,
    plotNo: this.plotNo,
    mobileNo: this.mobileNo,
    aadharNo: this.aadharNo,
    gharkul: this.gharkul,
    pavatiKramank: this.pavatiKramank,
    village: this.village,
    panchayat: this.panchayat,
    taluka: this.taluka,
    district: this.district,
    gharMalakName: this.gharMalakName,
    patiName: this.patiName,
    bhogvatadarName: this.bhogvatadarName,
    magilGharPatti: this.magilGharPatti,
    chaluGharPatti: this.chaluGharPatti,
    magilDiwabatti: this.magilDiwabatti,
    chaluDiwabatti: this.chaluDiwabatti,
    magilArogya: this.magilArogya,
    chaluArogya: this.chaluArogya,
    magilPanipattiSamanya: this.magilPanipattiSamanya || this.magilPanipatti || 0,
    chaluPanipattiSamanya: this.chaluPanipattiSamanya || this.chaluPanipatti || 0,
    magilPanipattiVishesh: this.magilPanipattiVishesh || 0,
    chaluPanipattiVishesh: this.chaluPanipattiVishesh || 0,
    // ✅ Calculated, not stored — मागील विशेष + चालू विशेष
    totalPanipattiVishesh: (this.magilPanipattiVishesh || 0) + (this.chaluPanipattiVishesh || 0),
    magilItar: this.magilItar,
    chaluItar: this.chaluItar,
    magilGharPattiVasuli: this.magilGharPattiVasuli,
    chaluGharPattiVasuli: this.chaluGharPattiVasuli,
    magilDiwabattiVasuli: this.magilDiwabattiVasuli,
    chaluDiwabattiVasuli: this.chaluDiwabattiVasuli,
    magilArogyaVasuli: this.magilArogyaVasuli,
    chaluArogyaVasuli: this.chaluArogyaVasuli,
    magilPanipattiVasuli: this.magilPanipattiVasuli,
    chaluPanipattiVasuli: this.chaluPanipattiVasuli,
    magilItarVasuli: this.magilItarVasuli,
    chaluItarVasuli: this.chaluItarVasuli,
    status: this.status,
    shera: this.shera,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Namuna9', namuna9Schema);