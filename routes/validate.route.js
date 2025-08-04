const express = require('express');
const validateController = require('../controllers/validate.controller');
const multer = require('multer');
const router = express.Router();
const emailVerified = require("../middlewares/email-verified");

const upload = multer({ dest: 'uploads/' });

/**
 * @swagger
 * /api/validatePost:
 *   post:
 *     tags:
 *       - Validate
 *     summary: Valide un post avec fichiers image
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Validation réussie
 *       400:
 *         description: Erreur de validation
 */
router.post('/validatePost', emailVerified, upload.array('image'), validateController.validatePost);

/**
 * @swagger
 * /api/validateData:
 *   post:
 *     tags:
 *       - Validate
 *     summary: Valide des données JSON
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *               field2:
 *                 type: number
 *             required:
 *               - field1
 *               - field2
 *     responses:
 *       200:
 *         description: Données validées avec succès
 *       400:
 *         description: Erreur de validation
 */
router.post('/validateData', validateController.validateData);

module.exports = router;
