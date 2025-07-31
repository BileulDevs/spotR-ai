const express = require('express');
const metricsController = require('../controllers/metrics.controller');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Metrics
 *     description: Routes pour consulter les métriques et rapports

 * /api/metrics:
 *   get:
 *     tags:
 *       - Metrics
 *     summary: Obtenir les métriques générales
 *     responses:
 *       200:
 *         description: Liste des métriques récupérées
 */
router.get('/', metricsController.getMetrics);

/**
 * @swagger
 * /api/metrics/errors:
 *   get:
 *     tags:
 *       - Metrics
 *     summary: Obtenir la liste des erreurs
 *     responses:
 *       200:
 *         description: Liste des erreurs récupérées
 */
router.get('/errors', metricsController.getErrors);

/**
 * @swagger
 * /api/metrics/warnings:
 *   get:
 *     tags:
 *       - Metrics
 *     summary: Obtenir la liste des avertissements
 *     responses:
 *       200:
 *         description: Liste des avertissements récupérés
 */
router.get('/warnings', metricsController.getWarnings);

module.exports = router;
