const express = require('express');
const cors = require('cors');
const router = require('./routes/index');
const logger = require('./config/logger.js');
require('dotenv').config();
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'API IA',
    version: '1.0.0',
    description: 'API Micro Service IA',
  },
};

const options = {
  swaggerDefinition,
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const init = async () => {
  try {
    app.use(express.json());
    app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    app.use('/api', router);

    app.listen(process.env.port, () => {
      console.log(`Listening on port: ${process.env.port}`);
      logger.log('info', 'Micro Service Notifs Started');
    });
  } catch (error) {
    console.error('Error:', error);
    logger.log('error', `Error: ${error.message}`);
    process.exit(1);
  }
};

init();
