const { scorecardTemplatesEnabled } = require('../controllers/settingsController');
async function requireScorecardTemplates(req, res, next) {
  try { if (!await scorecardTemplatesEnabled()) return res.status(403).json({ message: '評分表模板功能目前由 Administrator 關閉。' }); next(); }
  catch (error) { next(error); }
}
module.exports = { requireScorecardTemplates };
