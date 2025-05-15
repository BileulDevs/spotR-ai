const fs = require('fs').promises;
const path = require('path');

const readLogFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => JSON.parse(line));
    } catch (err) {
        throw new Error(`Erreur lors de la lecture du fichier : ${err.message}`);
    }
};

const storageDirectory = './storage';

module.exports = {
    getMetrics: async (req, res) => {
        try {
            const logs = await readLogFile(path.join(storageDirectory, 'metrics.log'));
            res.status(200).json(logs);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    getErrors: async (req, res) => {
        try {
            const logs = await readLogFile(path.join(storageDirectory, 'errors.log'));
            res.status(200).json(logs);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    getWarnings: async (req, res) => {
        try {
            const logs = await readLogFile(path.join(storageDirectory, 'warnings.log'));
            res.status(200).json(logs);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },
};
