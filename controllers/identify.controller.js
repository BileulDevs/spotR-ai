const logger = require("../config/logger");
const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.identifyCar = async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, error: "Aucune image n'a été fournie." });
    }

    const filePath = req.file.path;
    const imageData = fs.readFileSync(filePath);
    const base64Image = imageData.toString('base64');

    logger.info("Envoi de l'image à l'API OpenAI pour identification");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Voici une image. Dis-moi si c'est une vraie voiture. " +
                "Si oui, renvoie un JSON avec les détails suivants : marque, modèle, version probable, génération, années de production, carburant, carrosserie, couleur, transmission, éléments visuels (calandre, phares, jantes, logo, etc) et success: true. " +
                "Sinon, renvoie simplement : { \"success\": false }"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    const result = response.choices[0].message.content;
    logger.info("Réponse reçue de l'API OpenAI");
    
    try {
      const parsed = JSON.parse(result);
      res.json(parsed);
    } catch (parseError) {
      logger.error("Erreur de parsing JSON:", parseError);
      
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          res.json(extractedJson);
        } catch (extractError) {
          logger.error("Impossible d'extraire un JSON valide:", extractError);
          res.status(500).json({ 
            success: false, 
            error: "Format de réponse invalide de l'API", 
            rawResponse: result 
          });
        }
      } else {
        res.status(500).json({ 
          success: false, 
          error: "Format de réponse inattendu", 
          rawResponse: result 
        });
      }
    }

    try {
      fs.unlinkSync(filePath);
      logger.info("Fichier temporaire supprimé:", filePath);
    } catch (unlinkError) {
      logger.warn("Impossible de supprimer le fichier temporaire:", unlinkError);
    }
    
  } catch (err) {
    logger.error('Erreur lors de l\'identification de la voiture:', err);
    res.status(500).json({ 
      success: false, 
      error: "Erreur serveur ou image non traitable.",
      message: err.message
    });

    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        logger.warn("Impossible de supprimer le fichier temporaire après erreur:", unlinkError);
      }
    }
  }
};