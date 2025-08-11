const fs = require('fs');
const {
  validatePost,
  validateData,
} = require('../controllers/validate.controller');
const logger = require('../config/logger');
const cloudinary = require('../config/cloudinary');
const { OpenAI } = require('openai');

jest.mock('fs');
jest.mock('../config/logger');
jest.mock('../config/cloudinary');
jest.mock('openai');
jest.mock('dotenv', () => ({ config: jest.fn() }));

global.fetch = jest.fn();

describe('ValidationController', () => {
  let req, res, mockOpenAI, consoleSpy;

  const validPostData = {
    brand: 'Toyota',
    model: 'Corolla',
    description: 'Voiture en excellent état',
    tags: ['berline', 'fiable'],
  };

  const mockFiles = [
    { originalname: 'car1.jpg', path: '/tmp/upload1.jpg' },
    { originalname: 'car2.jpg', path: '/tmp/upload2.jpg' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockOpenAI = { chat: { completions: { create: jest.fn() } } };
    OpenAI.mockImplementation(() => mockOpenAI);

    req = {
      body: {},
      files: [],
      headers: { authorization: 'Bearer token' },
    };

    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    fs.readFileSync.mockReturnValue(Buffer.from('imgdata'));
    fs.unlinkSync.mockImplementation(() => {});
    cloudinary.uploader.upload = jest.fn();
    logger.info = jest.fn();
    logger.error = jest.fn();
    logger.warn = jest.fn();

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const mockGPT = (response) =>
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(response) } }],
    });

  describe('validatePost', () => {
    beforeEach(() => {
      req.body = { ...validPostData };
      req.files = [...mockFiles];
      cloudinary.uploader.upload.mockResolvedValue({
        secure_url: 'http://img.com/img.jpg',
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, ...validPostData }),
      });
    });

    describe("Validation des données d'entrée", () => {
      ['brand', 'model', 'description', 'tags'].forEach((field) => {
        it(`rejette si ${field} est manquant`, async () => {
          delete req.body[field];
          await validatePost(req, res);
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: 'Champs requis manquants ou images non fournies.',
          });
        });
      });

      it('rejette si aucune image fournie', async () => {
        req.files = [];
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Champs requis manquants ou images non fournies.',
        });
      });

      it('rejette si images est null', async () => {
        req.files = null;
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('rejette si tags est null', async () => {
        req.body.tags = null;
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Parsing des tags', () => {
      it('parse les tags depuis une string JSON valide', async () => {
        req.body.tags = '["berline","fiable"]';
        mockGPT({ success: true, acceptabilityScore: 85 });
        await validatePost(req, res);
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
      });

      it('parse les tags via split si JSON.parse échoue', async () => {
        req.body.tags = 'berline,fiable,économique';
        mockGPT({ success: true, acceptabilityScore: 85 });
        await validatePost(req, res);
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
      });

      it('conserve les tags si déjà un array', async () => {
        req.body.tags = ['berline', 'fiable'];
        mockGPT({ success: true, acceptabilityScore: 85 });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
      });
    });

    describe('Upload Cloudinary', () => {
      it('uploade toutes les images sur Cloudinary', async () => {
        mockGPT({ success: true, acceptabilityScore: 85 });
        await validatePost(req, res);
        expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(2);
        expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
          '/tmp/upload1.jpg',
          {
            folder: 'posts',
            use_filename: true,
            unique_filename: false,
            resource_type: 'image',
          }
        );
      });

      it('gère les erreurs Cloudinary', async () => {
        cloudinary.uploader.upload.mockRejectedValue(
          new Error('Cloudinary upload failed')
        );
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Erreur serveur',
          message: 'Cloudinary upload failed',
        });
      });
    });

    describe('Validation GPT', () => {
      it('valide un post correct via GPT', async () => {
        mockGPT({ success: true, acceptabilityScore: 85, info: 'Post valide' });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: 'Post valide',
          post: { id: 1, ...validPostData },
        });
      });

      it('rejette un post invalide via GPT', async () => {
        mockGPT({
          success: false,
          acceptabilityScore: 50,
          errors: ['Marque inconnue'],
        });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          acceptabilityScore: 50,
          errors: ['Marque inconnue'],
        });
      });

      it('gère une erreur GPT', async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue(
          new Error('GPT API Error')
        );
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(logger.error).toHaveBeenCalledWith(
          'Erreur dans validatePost:',
          expect.any(Error)
        );
      });

      it('gère une réponse GPT complètement invalide', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{ message: { content: 'Réponse non JSON invalide' } }],
        });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('parse une réponse GPT avec regex quand JSON.parse échoue', async () => {
        const jsonContent =
          '{"success": true, "acceptabilityScore": 85, "info": "ok"}';
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [
            {
              message: {
                content: `Voici la réponse: ${jsonContent} avec du texte après`,
              },
            },
          ],
        });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
      });

      it('gère le cas où la réponse GPT ne contient aucun JSON valide', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{ message: { content: 'Aucun JSON ici du tout' } }],
        });
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('Sauvegarde en base de données', () => {
      it('sauvegarde en BDD après validation réussie', async () => {
        mockGPT({ success: true, acceptabilityScore: 85, info: 'ok' });
        await validatePost(req, res);

        expect(global.fetch).toHaveBeenCalledWith(
          `${process.env.SERVICE_BDD_URL}/api/posts`,
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: req.headers.authorization,
            },
          })
        );
        expect(res.status).toHaveBeenCalledWith(201);
      });

      it('gère les erreurs de base de données', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          json: () => Promise.resolve({ error: 'Database error' }),
        });
        mockGPT({ success: true, acceptabilityScore: 85 });

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Validation réussie mais échec de l'enregistrement",
          details: { error: 'Database error' },
        });
      });
    });

    describe('Nettoyage des fichiers temporaires', () => {
      it('supprime les fichiers temporaires après succès', async () => {
        mockGPT({ success: true, acceptabilityScore: 85 });
        await validatePost(req, res);
        expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload1.jpg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload2.jpg');
      });

      it("supprime les fichiers temporaires même en cas d'erreur GPT", async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue(
          new Error('GPT Error')
        );
        await validatePost(req, res);
        expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      });

      it('gère les erreurs de suppression de fichiers temporaires', async () => {
        fs.unlinkSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });
        mockGPT({ success: true, acceptabilityScore: 85 });

        await validatePost(req, res);

        expect(logger.warn).toHaveBeenCalledWith(
          'Erreur suppression fichier:',
          expect.any(Error)
        );
        expect(res.status).toHaveBeenCalledWith(201);
      });

      it('gère le cas où files est null dans le finally', async () => {
        req.files = null;
        await validatePost(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });
  });

  describe('validateData', () => {
    const validData = {
      username: 'testuser',
      email: 'test@example.com',
      message: 'Hello world',
    };

    beforeEach(() => {
      req.body = { ...validData };
    });

    describe("Validation des données d'entrée", () => {
      it('rejette si body est null', async () => {
        req.body = null;
        await validateData(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Aucune donnée fournie.',
        });
      });

      it('rejette si body est undefined', async () => {
        req.body = undefined;
        await validateData(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe('Validation GPT', () => {
      it('valide des données correctes', async () => {
        mockGPT({ success: true, info: 'Validation des données OK' });
        await validateData(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: 'Validation des données OK',
        });
      });

      it('rejette des données invalides', async () => {
        mockGPT({
          success: false,
          errors: ['username: contenu inapproprié', 'email: format invalide'],
        });
        await validateData(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          errors: ['username: contenu inapproprié', 'email: format invalide'],
        });
      });

      it('utilise un message par défaut si info manque', async () => {
        mockGPT({ success: true });
        await validateData(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: 'Données validées',
        });
      });

      it('gère les erreurs GPT', async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue(
          new Error('GPT API Error')
        );
        await validateData(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(logger.error).toHaveBeenCalledWith(
          'Erreur dans validateData:',
          expect.any(Error)
        );
      });

      it('gère une réponse GPT complètement invalide', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{ message: { content: 'Réponse non JSON invalide' } }],
        });
        await validateData(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('parse une réponse GPT avec regex quand JSON.parse échoue', async () => {
        const jsonContent = '{"success": true, "info": "Données validées"}';
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{ message: { content: `Préfixe ${jsonContent} suffixe` } }],
        });
        await validateData(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: 'Données validées',
        });
      });

      it('gère le cas où la réponse GPT ne contient aucun JSON', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{ message: { content: 'Aucun JSON ici' } }],
        });
        await validateData(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('Console log', () => {
      it('affiche le username dans la console', async () => {
        req.body.username = 'testuser';
        mockGPT({ success: true, info: 'ok' });

        await validateData(req, res);

        expect(consoleSpy).toHaveBeenCalledWith('testuser');
      });

      it('gère le cas où username est undefined', async () => {
        req.body = { email: 'test@example.com', message: 'Hello' };
        mockGPT({ success: true, info: 'ok' });

        await validateData(req, res);

        expect(consoleSpy).toHaveBeenCalledWith(undefined);
      });
    });
  });

  describe('Intégration et cas edge', () => {
    it('validatePost avec tous les cas edge combinés', async () => {
      req.body = {
        brand: 'Tesla',
        model: 'Model 3',
        description: 'Voiture électrique',
        tags: 'électrique,écologique',
      };
      req.files = [{ originalname: 'tesla.jpg', path: '/tmp/tesla.jpg' }];

      const jsonContent =
        '{"success": true, "acceptabilityScore": 90, "info": "Tesla valide"}';
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: `Analyse: ${jsonContent}` } }],
      });

      cloudinary.uploader.upload.mockResolvedValue({
        secure_url: 'http://img.com/tesla.jpg',
      });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42, brand: 'Tesla' }),
      });

      await validatePost(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/tesla.jpg');
    });

    it('validateData avec corps complexe', async () => {
      req.body = {
        username: 'user123',
        email: 'user@test.com',
        message: 'Message de test',
        metadata: { version: 1 },
      };

      mockGPT({ success: true, info: 'Données complexes validées' });
      await validateData(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(consoleSpy).toHaveBeenCalledWith('user123');
    });
  });
});
