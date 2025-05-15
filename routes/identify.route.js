const express = require('express');
const identifyController = require('../controllers/identify.controller');
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: 'uploads/' });


router.post('/identify-car', upload.single('image'), identifyController.identifyCar);

module.exports = router;