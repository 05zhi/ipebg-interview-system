const express = require('express');
const availabilityLinkController = require('../controllers/availabilityLinkController');

const router = express.Router();
router.get('/availability/:token', availabilityLinkController.publicGet);
router.put('/availability/:token/day', availabilityLinkController.publicReplaceDay);

module.exports = router;
