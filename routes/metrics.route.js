const express = require('express');
const metricsController = require('../controllers/metrics.controller');
const router = express.Router();

router.get('/', metricsController.getMetrics);
router.get('/errors', metricsController.getErrors);
router.get('/warnings', metricsController.getWarnings);


module.exports = router;