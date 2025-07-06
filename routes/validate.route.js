const express = require('express');
const validateController = require('../controllers/validate.controller');
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: 'uploads/' });

router.post('/validatePost', upload.array('image'), validateController.validatePost);
router.post('/validateData', validateController.validateData);

module.exports = router;