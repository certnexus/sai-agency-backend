// ✅ These are ONLY used the very first time (when no Settings document exists yet
// in MongoDB). Once a user saves the Master/Area Tax/Depreciation tables, the
// values saved in MongoDB always take priority over these hardcoded defaults.

const DEFAULT_MASTER_RATES = [
  { desc: 'झोपडी किंवा मातीची इमारत', landRate: 560, buildRate: 0, constructionRate: 5355, taxRate: 30, taxPercent: 0 },
  { desc: 'दगड, किंवा विटा वापरलेली मातीची इमारत', landRate: 560, buildRate: 0, constructionRate: 7140, taxRate: 60, taxPercent: 0 },
  { desc: 'दगड, विटांची व चुना किंवा सिमेंट वापरून उभारलेली इमारत', landRate: 560, buildRate: 0, constructionRate: 10710, taxRate: 75, taxPercent: 0 },
  { desc: 'आरसीसी पध्दतीची इमारत', landRate: 1100, buildRate: 0, constructionRate: 11900, taxRate: 120, taxPercent: 0 },
  { desc: 'आर.सी.सी (मनोऱ्याचे घर)', landRate: 1100, buildRate: 0, constructionRate: 11900, taxRate: 200, taxPercent: 0 },
  { desc: 'खाली जागा', landRate: 560, buildRate: 0, constructionRate: 560, taxRate: 150, taxPercent: 0 },
  { desc: 'खुली जागा', landRate: 560, buildRate: 0, constructionRate: 560, taxRate: 150, taxPercent: 0 },
];

const DEFAULT_AREA_TAX_RATES = [
  { range: '0 ते 300', arogya: 30, diwabatti: 4 },
  { range: '301 ते 700', arogya: 55, diwabatti: 66 },
  { range: '700 च्या पुढे', arogya: 55, diwabatti: 55 },
];

const DEFAULT_DEPRECIATION_RATES = [
  { age: '0 ते 2', type1: 100, type2: 100 },
  { age: '2 पेक्षा जास्त व 5 वर्षापर्यंत', type1: 95, type2: 95 },
  { age: '5 पेक्षा जास्त व 10 वर्षापर्यंत', type1: 85, type2: 90 },
  { age: '10 पेक्षा जास्त व 20 वर्षापर्यंत', type1: 75, type2: 80 },
  { age: '20 पेक्षा जास्त व 30 वर्षापर्यंत', type1: 60, type2: 70 },
  { age: '30 पेक्षा जास्त व 40 वर्षापर्यंत', type1: 45, type2: 60 },
  { age: '40 पेक्षा जास्त व 50 वर्षापर्यंत', type1: 30, type2: 50 },
  { age: '50 पेक्षा जास्त व 60 वर्षापर्यंत', type1: 20, type2: 40 },
];

module.exports = {
  DEFAULT_MASTER_RATES,
  DEFAULT_AREA_TAX_RATES,
  DEFAULT_DEPRECIATION_RATES,
};
