const fs = require('fs');
const { OpenAI } = require('openai');
const logger = require('../config/logger');
const cloudinary = require('../config/cloudinary');
require('dotenv').config();

// Initialisation du client OpenAI avec la clé API
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Valide une publication d'annonce automobile avant publication
 * Utilise GPT-4 Vision pour analyser les images et le contenu textuel
 * Vérifie la cohérence marque/modèle, détecte le contenu inapproprié,
 * et analyse les images pour s'assurer qu'elles correspondent à la description
 */
exports.validatePost = async (req, res) => {
  let { brand, model, description, tags } = req.body;

  // Parsing des tags qui peuvent être une string JSON ou une string séparée par des virgules
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags); // Tentative de parsing JSON
    } catch (err) {
      // Fallback : split par virgules si ce n'est pas du JSON
      tags = tags.split(',').map((t) => t.trim());
    }
  }

  const images = req.files; // Images uploadées via middleware multer

  // Validation des champs requis
  if (
    !brand ||
    !model ||
    !description ||
    !tags ||
    !images ||
    images.length < 1
  ) {
    return res.status(400).json({
      success: false,
      error: 'Champs requis manquants ou images non fournies.',
    });
  }

  try {
    // Upload des images sur Cloudinary et conversion en base64 pour GPT
    const uploadedImages = await Promise.all(
      images.map(async (file) => {
        // Upload vers Cloudinary pour stockage permanent
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'posts',
          use_filename: true,
          unique_filename: false,
          resource_type: 'image',
        });
        return {
          name: file.originalname,
          url: result.secure_url, // URL publique de l'image
          base64: fs.readFileSync(file.path).toString('base64'), // Pour GPT Vision
        };
      })
    );

    // Prompt détaillé pour GPT-4 Vision avec instructions spécifiques
    const prompt = `
Tu es un assistant expert en automobile et en détection de contenu inapproprié.
Tu dois évaluer la fiabilité d'une annonce de voiture d'occasion selon les critères suivants :

1. Vérifie si la marque et le modèle sont réels et cohérents.
2. Analyse la description pour détecter tout contenu déplacé, insultant ou inapproprié.
3. Valide les tags s'ils sont pertinents et non offensants.
4. Analyse les images : Dis-moi si elles montrent une voiture cohérente avec la marque, le modèle et la description, et si elles sont différentes (pas de doublons ou d'incohérences).

Tu dois produire une évaluation globale de l'annonce sous forme d'un indice d'acceptabilité (de 0 à 100). Si l'indice est supérieur ou égal à 80, l'annonce est considérée comme valide.

Formulaire :
{
  "brand": "${brand}",
  "model": "${model}",
  "description": "${description.replace(/"/g, '\\"')}", // Échappement des guillemets
  "tags": ${JSON.stringify(tags)}
}

Images (base64, JPEG) :
${uploadedImages.map((img, i) => `[Image ${i + 1}]: data:image/jpeg;base64,${img.base64.slice(0, 50)}...`).join('\n')}

Ta réponse doit être uniquement un JSON au format :
- Si le score est >= 80 :
  {
    "success": true,
    "acceptabilityScore": 85, // par exemple
    "info": "Formulaire globalement valide. Quelques imprécisions mineures, mais acceptables."
  }

- Si le score est < 80 :
  {
    "success": false,
    "acceptabilityScore": 65, // par exemple
    "errors": [
      "La marque 'Xxx' semble inconnue.",
      "Une image ne correspond pas à la voiture décrite."
    ]
  }

Sois rigoureux mais tolérant : si tu n'es pas certain à 100% mais que l'ensemble semble cohérent, accorde un score élevé.
`;

    // Construction du message pour GPT avec texte et images
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          // Ajout de chaque image en base64 pour analyse visuelle
          ...uploadedImages.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img.base64}` },
          })),
        ],
      },
    ];

    logger.info('Validation GPT...');
    
    // Appel à GPT-4 Vision pour analyse multimodale (texte + images)
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o', // Modèle avec capacités vision
      messages,
      max_tokens: 1200,
    });

    const result = gptResponse.choices[0].message.content;
    let parsed;

    // Parsing robuste de la réponse JSON de GPT
    try {
      parsed = JSON.parse(result);
    } catch {
      // Fallback : extraction du JSON depuis la réponse si enveloppé dans du texte
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Réponse GPT invalide');
      }
    }

    // Si la validation GPT échoue, retourner l'erreur
    if (!parsed.success) {
      return res.status(400).json(parsed);
    }

    logger.info('Envoi des données au microservice BDD...');
    
    // Si validation réussie, enregistrement dans la base de données
    const bddResponse = await fetch(
      `${process.env.SERVICE_BDD_URL}/api/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization, // Transmission du token utilisateur
        },
        body: JSON.stringify({
          brand,
          model,
          description,
          tags,
          images: uploadedImages.map((img) => img.url), // URLs Cloudinary seulement
        }),
      }
    );

    const bddResult = await bddResponse.json();

    // Gestion des erreurs de base de données
    if (!bddResponse.ok) {
      logger.error('Erreur BDD:', bddResult);
      return res.status(500).json({
        success: false,
        error: "Validation réussie mais échec de l'enregistrement",
        details: bddResult,
      });
    }

    // Succès complet : validation + enregistrement
    return res.status(201).json({
      success: true,
      info: parsed.info || 'Post validé et créé',
      post: bddResult,
    });
  } catch (err) {
    logger.error('Erreur dans validatePost:', err);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      message: err.message,
    });
  } finally {
    // Nettoyage : suppression des fichiers temporaires uploadés
    if (images) {
      for (const file of images) {
        try {
          fs.unlinkSync(file.path); // Suppression du fichier local temporaire
        } catch (err) {
          logger.warn('Erreur suppression fichier:', err);
        }
      }
    }
  }
};

/**
 * Valide les données d'un formulaire pour détecter du contenu inapproprié
 * Utilise GPT-4 pour analyser le contenu textuel et détecter :
 * - Jeux de mots déplacés
 * - Contenu insultant ou inapproprié
 * - Tout élément non conforme
 */
exports.validateData = async (req, res) => {
  let body = req.body;

  // Vérification de la présence de données
  if (!body) {
    return res
      .status(400)
      .json({ success: false, error: 'Aucune donnée fournie.' });
  }

  try {
    // Prompt simple et direct pour la détection de contenu inapproprié
    const prompt = `
Tu es un outil de détection de contenu inapproprié.
Voici le body d'une requete à valider. Tu dois :

Vérifier que le contenu du body est correct (pas de jeu de mots, contenu déplacé, insultant ou inapproprié)

Voici le body : ${JSON.stringify(req.body)}

IMPORTANT: Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans aucun texte supplémentaire, sans blocs de code markdown, sans backticks.

Réponds uniquement avec l'un de ces formats JSON exacts :

Pour un contenu approprié :
{"success": true}

Pour un contenu inapproprié :
{"success": false}

Aucun autre format n'est accepté.
`;

    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ];

    logger.info('Validation des données via GPT...');
    
    // Appel GPT avec paramètres stricts pour obtenir une réponse JSON simple
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 50,     // Limite très basse car réponse simple attendue
      temperature: 0,     // Température 0 pour réponse déterministe
    });

    const result = gptResponse.choices[0].message.content.trim();
    let parsed;

    try {
      // Fonction robuste pour nettoyer et extraire le JSON de la réponse GPT
      const extractAndParseJSON = (text) => {
        // Suppression des blocs de code markdown possibles
        let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Suppression des backticks restants
        cleaned = cleaned.replace(/`/g, '');

        cleaned = cleaned.trim();

        try {
          return JSON.parse(cleaned);
        } catch {
          // Fallback 1 : extraction du premier objet JSON trouvé
          const jsonMatch = cleaned.match(/\{[^}]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }

          // Fallback 2 : analyse sémantique si pas de JSON valide
          if (
            cleaned.toLowerCase().includes('success') &&
            cleaned.toLowerCase().includes('true')
          ) {
            return { success: true };
          } else if (
            cleaned.toLowerCase().includes('success') &&
            cleaned.toLowerCase().includes('false')
          ) {
            return { success: false };
          }

          throw new Error('Aucun JSON valide trouvé');
        }
      };

      parsed = extractAndParseJSON(result);
    } catch (parseError) {
      logger.error('Erreur de parsing GPT:', parseError);
      logger.error('Réponse GPT brute:', result);

      return res.status(500).json({
        success: false,
        error: 'Erreur de validation - réponse GPT invalide',
        details: parseError.message,
      });
    }

    // Si contenu inapproprié détecté
    if (!parsed.success) {
      return res.status(200).json({
        success: false,
        error: 'Contenu inapproprié détecté',
      });
    }

    // Validation réussie
    return res.status(200).json({
      success: true,
      message: 'Données validées avec succès',
    });
  } catch (err) {
    logger.error('Erreur dans validateData:', err);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      message: err.message,
    });
  }
};