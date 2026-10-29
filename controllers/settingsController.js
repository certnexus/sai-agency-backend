const Settings = require('../models/Settings');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const {
  DEFAULT_MASTER_RATES,
  DEFAULT_AREA_TAX_RATES,
  DEFAULT_DEPRECIATION_RATES,
} = require('../utils/defaultRates');

// ✅ LEGACY: identifier of the old single global settings document, from
// before rate tables were split Per Gram Panchayat. Used ONLY by
// getOrCreateSettings to migrate/seed a Gram Panchayat's very first rates.
const LEGACY_GLOBAL_KEY = 'global-rates';

const normalizePanchayat = (name) => (name || '').toString().trim();

/**
 * ✅ Per Gram Panchayat settings: every Gram Panchayat now has its OWN
 * masterRates / areaTaxRates / depreciationRates document, looked up by
 * `gramPanchayatName`. Data never mixes between Gram Panchayats — updating
 * one Gram Panchayat's rates never touches another's.
 *
 * The very first time ANY Gram Panchayat's settings are requested (i.e. no
 * document exists yet for it), we seed it from the old pre-migration
 * global rates document if one exists (so nobody's already-customised
 * rates silently reset to the hardcoded defaults); after that, each Gram
 * Panchayat's document is updated independently.
 */
const getOrCreateSettings = async (gramPanchayatName) => {
  const panchayat = normalizePanchayat(gramPanchayatName);

  let settings = await Settings.findOne({ gramPanchayatName: panchayat });

  if (!settings) {
    const legacyGlobal = await Settings.findOne({ key: LEGACY_GLOBAL_KEY });

    settings = await Settings.create({
      gramPanchayatName: panchayat,
      masterRates: legacyGlobal?.masterRates?.length
        ? legacyGlobal.masterRates
        : DEFAULT_MASTER_RATES,
      areaTaxRates: legacyGlobal?.areaTaxRates?.length
        ? legacyGlobal.areaTaxRates
        : DEFAULT_AREA_TAX_RATES,
      depreciationRates: legacyGlobal?.depreciationRates?.length
        ? legacyGlobal.depreciationRates
        : DEFAULT_DEPRECIATION_RATES,
    });
  }

  return settings;
};

// ✅ Resolves which Gram Panchayat's rates a request should read/write.
// - Non-admin (`user`): ALWAYS hard-locked to their OWN Gram Panchayat —
//   this can NOT be overridden by a `?panchayat=` query param or a
//   `panchayat` field in the body, so one Gram Panchayat user can never
//   see or update another Gram Panchayat's rates.
// - Admin: has no Gram Panchayat of their own, so they must explicitly say
//   which Gram Panchayat they want via `?panchayat=` (GET) or `panchayat`
//   in the body (PUT). This is what lets an admin manage ANY Gram
//   Panchayat's rates.
const resolveGramPanchayat = (req) => {
  if (req.user && req.user.role !== 'admin') {
    return { panchayat: normalizePanchayat(req.user.gramPanchayatName), locked: true };
  }

  const requested = normalizePanchayat(req.query?.panchayat || req.body?.panchayat);
  return { panchayat: requested, locked: false };
};

// GET /api/settings?panchayat=...   (panchayat only required/used for admin)
const getSettings = async (req, res, next) => {
  try {
    const { panchayat, locked } = resolveGramPanchayat(req);

    if (!locked && !panchayat) {
      return next(
        new AppError('कृपया आधी ग्रामपंचायत निवडा (?panchayat=...)', 400)
      );
    }

    const settings = await getOrCreateSettings(panchayat);

    res.status(200).json({
      success: true,
      data: {
        gramPanchayatName: settings.gramPanchayatName,
        masterRates: settings.masterRates,
        areaTaxRates: settings.areaTaxRates,
        depreciationRates: settings.depreciationRates,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/settings
// Body: { panchayat? (admin only), masterRates?, areaTaxRates?, depreciationRates? }
// ✅ This is what makes the rate tables behave like real application settings:
// whatever the user saves here is permanently persisted in MongoDB, scoped
// to their own Gram Panchayat (or the Gram Panchayat an admin specifies),
// and will be loaded automatically on every future page load / new property
// for that SAME Gram Panchayat only.
const updateSettings = async (req, res, next) => {
  try {
    const { masterRates, areaTaxRates, depreciationRates } = req.body;
    const { panchayat, locked } = resolveGramPanchayat(req);

    if (!locked && !panchayat) {
      return next(
        new AppError('कृपया अपडेट करण्यासाठी ग्रामपंचायत निवडा', 400)
      );
    }

    const settings = await getOrCreateSettings(panchayat);

    if (masterRates !== undefined) settings.masterRates = masterRates;
    if (areaTaxRates !== undefined) settings.areaTaxRates = areaTaxRates;
    if (depreciationRates !== undefined) settings.depreciationRates = depreciationRates;
    if (req.user?._id) settings.updatedBy = req.user._id;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'दर यशस्वीरित्या जतन झाले',
      data: {
        gramPanchayatName: settings.gramPanchayatName,
        masterRates: settings.masterRates,
        areaTaxRates: settings.areaTaxRates,
        depreciationRates: settings.depreciationRates,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ✅ NEW: GET /api/settings/panchayats  (admin only)
// Distinct list of Gram Panchayat names (from registered Users) so an
// admin UI can offer a "कोणत्या ग्रामपंचायतीचे दर बदलायचे?" dropdown.
const getSettingsPanchayatList = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return next(new AppError('फक्त admin सर्व ग्रामपंचायतींची यादी पाहू शकतो', 403));
    }

    const names = await User.distinct('gramPanchayatName');
    const cleaned = names
      .filter((n) => n && n.trim())
      .sort((a, b) => a.localeCompare(b, 'mr'));

    res.status(200).json({
      success: true,
      data: cleaned,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getOrCreateSettings,
  getSettingsPanchayatList,
};