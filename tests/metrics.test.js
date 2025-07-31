const fs = require('fs').promises;
const path = require('path');
const logsController = require('../controllers/metrics.controller');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

// Mock path (optionnel car path.join fonctionne normalement)
jest.mock('path');

describe('MetricsController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock req et res
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Mock path.join pour retourner des chemins prévisibles
    path.join.mockImplementation((...args) => args.join('/'));
  });

  describe('readLogFile (fonction utilitaire)', () => {
    // On teste indirectement readLogFile à travers les méthodes du controller
    // car elle n'est pas exportée directement

    const mockLogData = `{"timestamp":"2025-01-01T10:00:00Z","level":"info","message":"Test message 1"}
{"timestamp":"2025-01-01T10:01:00Z","level":"info","message":"Test message 2"}

{"timestamp":"2025-01-01T10:02:00Z","level":"info","message":"Test message 3"}`;

    it('devrait parser correctement les logs JSON multi-lignes', async () => {
      fs.readFile.mockResolvedValue(mockLogData);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"timestamp":"2025-01-01T10:00:00Z","level":"info","message":"Test message 1"},
        {"timestamp":"2025-01-01T10:01:00Z","level":"info","message":"Test message 2"},
        {"timestamp":"2025-01-01T10:02:00Z","level":"info","message":"Test message 3"}
      ]);
    });

    it('devrait ignorer les lignes vides', async () => {
      const logDataWithEmptyLines = `{"timestamp":"2025-01-01T10:00:00Z","level":"info","message":"Test 1"}


{"timestamp":"2025-01-01T10:01:00Z","level":"info","message":"Test 2"}

`;
      fs.readFile.mockResolvedValue(logDataWithEmptyLines);

      await logsController.getMetrics(req, res);

      expect(res.json).toHaveBeenCalledWith([
        {"timestamp":"2025-01-01T10:00:00Z","level":"info","message":"Test 1"},
        {"timestamp":"2025-01-01T10:01:00Z","level":"info","message":"Test 2"}
      ]);
    });

    it('devrait gérer un fichier vide', async () => {
      fs.readFile.mockResolvedValue('');

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('devrait gérer les erreurs de parsing JSON', async () => {
      const invalidJsonData = `{"valid":"json"}
invalid json line
{"another":"valid"}`;
      
      fs.readFile.mockResolvedValue(invalidJsonData);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.stringContaining('Erreur lors de la lecture du fichier')
      });
    });
  });

  describe('getMetrics', () => {
    const mockMetricsData = `{"timestamp":"2025-01-01T10:00:00Z","type":"request","method":"POST","endpoint":"/api/validate","duration":150}
{"timestamp":"2025-01-01T10:01:00Z","type":"request","method":"GET","endpoint":"/api/metrics","duration":25}
{"timestamp":"2025-01-01T10:02:00Z","type":"system","cpu_usage":75.5,"memory_usage":60.2}`;

    it('devrait retourner les métriques avec succès', async () => {
      fs.readFile.mockResolvedValue(mockMetricsData);

      await logsController.getMetrics(req, res);

      expect(fs.readFile).toHaveBeenCalledWith('./storage/metrics.log', 'utf8');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"timestamp":"2025-01-01T10:00:00Z","type":"request","method":"POST","endpoint":"/api/validate","duration":150},
        {"timestamp":"2025-01-01T10:01:00Z","type":"request","method":"GET","endpoint":"/api/metrics","duration":25},
        {"timestamp":"2025-01-01T10:02:00Z","type":"system","cpu_usage":75.5,"memory_usage":60.2}
      ]);
    });

    it('devrait gérer l\'erreur si le fichier de métriques n\'existe pas', async () => {
      const fileError = new Error('ENOENT: no such file or directory');
      fs.readFile.mockRejectedValue(fileError);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erreur lors de la lecture du fichier : ENOENT: no such file or directory'
      });
    });

    it('devrait gérer les erreurs de permission sur le fichier', async () => {
      const permissionError = new Error('EACCES: permission denied');
      fs.readFile.mockRejectedValue(permissionError);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erreur lors de la lecture du fichier : EACCES: permission denied'
      });
    });

    it('devrait utiliser le bon chemin pour le fichier metrics.log', async () => {
      fs.readFile.mockResolvedValue('{}');

      await logsController.getMetrics(req, res);

      expect(path.join).toHaveBeenCalledWith('./storage', 'metrics.log');
      expect(fs.readFile).toHaveBeenCalledWith('./storage/metrics.log', 'utf8');
    });
  });

  describe('getErrors', () => {
    const mockErrorsData = `{"timestamp":"2025-01-01T10:00:00Z","level":"error","message":"Database connection failed","stack":"Error: Connection timeout..."}
{"timestamp":"2025-01-01T10:01:00Z","level":"error","message":"OpenAI API limit exceeded","code":"rate_limit_exceeded"}
{"timestamp":"2025-01-01T10:02:00Z","level":"error","message":"File upload failed","details":{"filename":"test.jpg","size":2048576}}`;

    it('devrait retourner les erreurs avec succès', async () => {
      fs.readFile.mockResolvedValue(mockErrorsData);

      await logsController.getErrors(req, res);

      expect(fs.readFile).toHaveBeenCalledWith('./storage/errors.log', 'utf8');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"timestamp":"2025-01-01T10:00:00Z","level":"error","message":"Database connection failed","stack":"Error: Connection timeout..."},
        {"timestamp":"2025-01-01T10:01:00Z","level":"error","message":"OpenAI API limit exceeded","code":"rate_limit_exceeded"},
        {"timestamp":"2025-01-01T10:02:00Z","level":"error","message":"File upload failed","details":{"filename":"test.jpg","size":2048576}}
      ]);
    });

    it('devrait gérer l\'erreur si le fichier d\'erreurs n\'existe pas', async () => {
      const fileError = new Error('File not found');
      fs.readFile.mockRejectedValue(fileError);

      await logsController.getErrors(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erreur lors de la lecture du fichier : File not found'
      });
    });

    it('devrait utiliser le bon chemin pour le fichier errors.log', async () => {
      fs.readFile.mockResolvedValue('{}');

      await logsController.getErrors(req, res);

      expect(path.join).toHaveBeenCalledWith('./storage', 'errors.log');
      expect(fs.readFile).toHaveBeenCalledWith('./storage/errors.log', 'utf8');
    });

    it('devrait retourner un tableau vide si le fichier d\'erreurs est vide', async () => {
      fs.readFile.mockResolvedValue('');

      await logsController.getErrors(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('getWarnings', () => {
    const mockWarningsData = `{"timestamp":"2025-01-01T10:00:00Z","level":"warning","message":"High memory usage detected","usage":"85%"}
{"timestamp":"2025-01-01T10:01:00Z","level":"warning","message":"Slow response time","endpoint":"/api/validate","duration":3500}
{"timestamp":"2025-01-01T10:02:00Z","level":"warning","message":"Deprecated API usage","deprecated_method":"old_validation"}`;

    it('devrait retourner les warnings avec succès', async () => {
      fs.readFile.mockResolvedValue(mockWarningsData);

      await logsController.getWarnings(req, res);

      expect(fs.readFile).toHaveBeenCalledWith('./storage/warnings.log', 'utf8');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"timestamp":"2025-01-01T10:00:00Z","level":"warning","message":"High memory usage detected","usage":"85%"},
        {"timestamp":"2025-01-01T10:01:00Z","level":"warning","message":"Slow response time","endpoint":"/api/validate","duration":3500},
        {"timestamp":"2025-01-01T10:02:00Z","level":"warning","message":"Deprecated API usage","deprecated_method":"old_validation"}
      ]);
    });

    it('devrait gérer l\'erreur si le fichier de warnings n\'existe pas', async () => {
      const fileError = new Error('ENOENT: no such file or directory');
      fs.readFile.mockRejectedValue(fileError);

      await logsController.getWarnings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erreur lors de la lecture du fichier : ENOENT: no such file or directory'
      });
    });

    it('devrait utiliser le bon chemin pour le fichier warnings.log', async () => {
      fs.readFile.mockResolvedValue('{}');

      await logsController.getWarnings(req, res);

      expect(path.join).toHaveBeenCalledWith('./storage', 'warnings.log');
      expect(fs.readFile).toHaveBeenCalledWith('./storage/warnings.log', 'utf8');
    });

    it('devrait gérer les erreurs de lecture asynchrone', async () => {
      const asyncError = new Error('Async read error');
      fs.readFile.mockRejectedValue(asyncError);

      await logsController.getWarnings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erreur lors de la lecture du fichier : Async read error'
      });
    });
  });

  describe('Gestion des erreurs communes', () => {
    const testMethods = [
      { method: 'getMetrics', file: 'metrics.log' },
      { method: 'getErrors', file: 'errors.log' },
      { method: 'getWarnings', file: 'warnings.log' }
    ];

    testMethods.forEach(({ method, file }) => {
      describe(`${method}`, () => {
        it('devrait gérer les erreurs de système de fichiers', async () => {
          const systemError = new Error('EIO: i/o error');
          fs.readFile.mockRejectedValue(systemError);

          await logsController[method](req, res);

          expect(res.status).toHaveBeenCalledWith(500);
          expect(res.json).toHaveBeenCalledWith({
            message: 'Erreur lors de la lecture du fichier : EIO: i/o error'
          });
        });

        it('devrait gérer les fichiers avec du JSON malformé', async () => {
          const malformedJson = '{"valid": "json"}\n{invalid json}\n{"another": "valid"}';
          fs.readFile.mockResolvedValue(malformedJson);

          await logsController[method](req, res);

          expect(res.status).toHaveBeenCalledWith(500);
          expect(res.json).toHaveBeenCalledWith({
            message: expect.stringContaining('Erreur lors de la lecture du fichier')
          });
        });

        it('devrait gérer les très gros fichiers', async () => {
          // Simuler un gros fichier avec beaucoup de lignes
          const bigFileContent = Array(1000)
            .fill('{"timestamp":"2025-01-01T10:00:00Z","message":"test"}')
            .join('\n');
          
          fs.readFile.mockResolvedValue(bigFileContent);

          await logsController[method](req, res);

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.arrayContaining([
              expect.objectContaining({
                timestamp: "2025-01-01T10:00:00Z",
                message: "test"
              })
            ])
          );
          // Vérifier que le tableau contient bien 1000 éléments
          expect(res.json.mock.calls[0][0]).toHaveLength(1000);
        });
      });
    });
  });

  describe('Configuration et chemins', () => {
    it('devrait utiliser le bon répertoire de stockage', async () => {
      fs.readFile.mockResolvedValue('{}');

      await logsController.getMetrics(req, res);
      await logsController.getErrors(req, res);
      await logsController.getWarnings(req, res);

      expect(path.join).toHaveBeenCalledWith('./storage', 'metrics.log');
      expect(path.join).toHaveBeenCalledWith('./storage', 'errors.log');
      expect(path.join).toHaveBeenCalledWith('./storage', 'warnings.log');
    });

    it('devrait utiliser l\'encodage UTF-8 pour la lecture des fichiers', async () => {
      fs.readFile.mockResolvedValue('{}');

      await logsController.getMetrics(req, res);

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.any(String),
        'utf8'
      );
    });
  });

  describe('Cas limites', () => {
    it('devrait gérer un fichier contenant uniquement des lignes vides', async () => {
      const emptyLines = '\n\n\n\n\n';
      fs.readFile.mockResolvedValue(emptyLines);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('devrait gérer un fichier avec des espaces et tabulations', async () => {
      const spacedContent = `  {"test": "value1"}  \n\t{"test": "value2"}\t\n   \n{"test": "value3"}   `;
      fs.readFile.mockResolvedValue(spacedContent);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"test": "value1"},
        {"test": "value2"},
        {"test": "value3"}
      ]);
    });

    it('devrait gérer les caractères Unicode', async () => {
      const unicodeContent = '{"message": "Erreur détectée: problème d\'accès àçèé", "emoji": "🚨"}';
      fs.readFile.mockResolvedValue(unicodeContent);

      await logsController.getMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        {"message": "Erreur détectée: problème d'accès àçèé", "emoji": "🚨"}
      ]);
    });
  });
});