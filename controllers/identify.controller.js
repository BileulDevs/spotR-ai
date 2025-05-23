const fs = require('fs');
const { OpenAI } = require('openai');
const logger = require('../config/logger');
const cloudinary = require('../config/cloudinary');
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

exports.validatePost = async (req, res) => {
  let { brand, model, description, tags } = req.body;

  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch (err) {
      tags = tags.split(',').map(t => t.trim());
    }
  }


  const images = req.files;

  if (!brand || !model || !description || !tags || !images || images.length < 1) {
    return res.status(400).json({ success: false, error: "Champs requis manquants ou images non fournies." });
  }

  try {
    // Upload sur Cloudinary
    const uploadedImages = await Promise.all(images.map(async file => {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "posts",
        use_filename: true,
        unique_filename: false,
        resource_type: "image"
      });
      return {
        name: file.originalname,
        url: result.secure_url,
        base64: fs.readFileSync(file.path).toString("base64") // pour GPT
      };
    }));

    // Construction du prompt pour OpenAI
    const prompt = `
Tu es un assistant expert en automobile et en détection de contenu inapproprié.
Voici un formulaire de création d’annonce de voiture d'occasion à valider. Tu dois :

1. Vérifier si la marque et le modèle sont réels et cohérents.
2. Analyser la description pour détecter tout contenu déplacé, insultant ou inapproprié.
3. Valider les tags s’ils sont pertinents et non offensants.
4. Vérifier les images : Dis-moi si elles montrent une voiture cohérente avec la marque/modèle et description, et si les images sont identiques ou non.

Formulaire :
{
  "brand": "${brand}",
  "model": "${model}",
  "description": "${description.replace(/"/g, '\\"')}",
  "tags": ${JSON.stringify(tags)}
}

Images (base64, JPEG):
${uploadedImages.map((img, i) => `[Image ${i + 1}]: data:image/jpeg;base64,${img.base64.slice(0, 50)}...`).join('\n')}

Tu dois répondre uniquement avec un JSON comme :
- Si tout est OK :
  {
    "success": true,
    "info": "Formulaire valide. Les images correspondent à la voiture décrite."
  }
- Sinon, donne les détails du problème :
  {
    "success": false,
    "errors": [
      "La marque 'Xxx' n'existe pas.",
      "La description contient un langage inapproprié.",
      "Les images ne montrent pas la même voiture."
    ]
  }
`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...uploadedImages.map(img => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${img.base64}` }
          }))
        ]
      }
    ];

    logger.info("Validation GPT...");
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 1200
    });

    const result = gptResponse.choices[0].message.content;
    let parsed;

    try {
      parsed = JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Réponse GPT invalide");
      }
    }

    if (!parsed.success) {
      return res.status(400).json(parsed);
    }

    logger.info("Envoi des données au microservice BDD...");
    const bddResponse = await fetch(`${process.env.SERVICE_BDD_URL}/api/posts`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": req.headers.authorization
      },
      body: JSON.stringify({
        brand,
        model,
        description,
        tags,
        images: uploadedImages.map(img => img.url)
      })
    });

    const bddResult = await bddResponse.json();

    if (!bddResponse.ok) {
      logger.error("Erreur BDD:", bddResult);
      return res.status(500).json({
        success: false,
        error: "Validation réussie mais échec de l'enregistrement",
        details: bddResult
      });
    }

    return res.status(201).json({
      success: true,
      info: parsed.info || "Post validé et créé",
      post: bddResult
    });

  } catch (err) {
    logger.error("Erreur dans validatePost:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur",
      message: err.message
    });
  } finally {
    // Nettoyage fichiers temporaires
    if (images) {
      for (const file of images) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          logger.warn("Erreur suppression fichier:", err);
        }
      }
    }
  }
};