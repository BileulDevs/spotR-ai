const fs = require('fs').promises;
const path = require('path');

/**
 * Lit et parse un fichier de log au format NDJSON (Newline Delimited JSON)
 * Chaque ligne du fichier doit être un objet JSON valide
 * 
 * @param {string} filePath - Chemin vers le fichier de log à lire
 * @returns {Promise<Array>} Tableau des objets JSON parsés depuis le fichier
 * @throws {Error} Si le fichier ne peut pas être lu ou si le JSON est invalide
 */
const readLogFile = async (filePath) => {
  try {
    // Lecture asynchrone du fichier en UTF-8
    const data = await fs.readFile(filePath, 'utf8');
    
    return data
      .split('\n')                    // Découpe par lignes
      .filter((line) => line.trim() !== '') // Supprime les lignes vides
      .map((line) => JSON.parse(line));      // Parse chaque ligne comme JSON
  } catch (err) {
    throw new Error(`Erreur lors de la lecture du fichier : ${err.message}`);
  }
};

// Répertoire de stockage des fichiers de logs
const storageDirectory = './storage';

module.exports = {
  /**
   * Récupère les métriques depuis le fichier metrics.log
   * Endpoint GET pour obtenir toutes les métriques de performance/utilisation
   * 
   * @param {Object} req - Objet request Express
   * @param {Object} res - Objet response Express
   * @returns {Promise<void>} Renvoie un JSON avec les métriques ou une erreur
   */
  getMetrics: async (req, res) => {
    try {
      // Lecture du fichier de métriques
      const logs = await readLogFile(
        path.join(storageDirectory, 'metrics.log')
      );
      
      // Retour des métriques en JSON
      res.status(200).json(logs);
    } catch (err) {
      // Gestion d'erreur si le fichier n'existe pas ou est illisible
      res.status(500).json({ message: err.message });
    }
  },

  /**
   * Récupère les erreurs depuis le fichier errors.log
   * Endpoint GET pour obtenir tous les logs d'erreurs de l'application
   * 
   * @param {Object} req - Objet request Express
   * @param {Object} res - Objet response Express
   * @returns {Promise<void>} Renvoie un JSON avec les erreurs ou une erreur
   */
  getErrors: async (req, res) => {
    try {
      // Lecture du fichier d'erreurs
      const logs = await readLogFile(path.join(storageDirectory, 'errors.log'));
      
      // Retour des erreurs en JSON
      res.status(200).json(logs);
    } catch (err) {
      // Gestion d'erreur si le fichier n'existe pas ou est illisible
      res.status(500).json({ message: err.message });
    }
  },

  /**
   * Récupère les avertissements depuis le fichier warnings.log
   * Endpoint GET pour obtenir tous les logs de warnings/avertissements
   * 
   * @param {Object} req - Objet request Express
   * @param {Object} res - Objet response Express
   * @returns {Promise<void>} Renvoie un JSON avec les warnings ou une erreur
   */
  getWarnings: async (req, res) => {
    try {
      // Lecture du fichier de warnings
      const logs = await readLogFile(
        path.join(storageDirectory, 'warnings.log')
      );
      
      // Retour des warnings en JSON
      res.status(200).json(logs);
    } catch (err) {
      // Gestion d'erreur si le fichier n'existe pas ou est illisible
      res.status(500).json({ message: err.message });
    }
  },
};