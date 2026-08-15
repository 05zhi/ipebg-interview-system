const router = require('express').Router();
const accounts = require('../controllers/hrAccountController');
const { authMiddleware, authorize } = require('../middleware/authMiddleware');

router.use(authMiddleware, authorize('administrator'));
router.get('/hr-accounts', accounts.list);
router.post('/hr-accounts', accounts.create);
router.patch('/hr-accounts/:id', accounts.update);
router.delete('/hr-accounts/:id', accounts.remove);

module.exports = router;
