const express = require('express');
const cors = require('cors');
const router = require("./routes/index");
const logger = require("./config/logger.js");
const multer = require('multer');
const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();

const upload = multer({ dest: 'uploads/' });

const init = async () => {
    try {
        app.use(express.json());
        app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));

        app.use("/api", router);

        app.listen(process.env.port, () => {
            console.log(`Listening on port: ${process.env.port}`);
            logger.log("info", "Micro Service Notifs Started");
        });

    } catch (error) {
        console.error("Error:", error);
        logger.log("error", `Error: ${error.message}`);
        process.exit(1);
    }
}

init();