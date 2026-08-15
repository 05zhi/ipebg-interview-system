const router = require('express').Router();
const auth = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/login', auth.login);
router.post('/logout', auth.logout);
router.get('/me', authMiddleware, auth.me);
router.patch('/password', authMiddleware, auth.changePassword);
router.patch('/profile', authMiddleware, auth.updateProfile);

module.exports = router;
