const fs = require('fs');
const { validatePost, validateData } = require('../controllers/validate.controller');
const logger = require('../config/logger');
const cloudinary = require('../config/cloudinary');
const { OpenAI } = require('openai');

// Mocks
jest.mock('fs');
jest.mock('../config/logger');
jest.mock('../config/cloudinary');
jest.mock('openai');
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn();

describe('ValidationController', () => {
  let req, res, mockOpenAI;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock OpenAI
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    OpenAI.mockImplementation(() => mockOpenAI);

    // Mock req et res
    req = {
      body: {},
      files: [],
      headers: {
        authorization: 'Bearer test-token'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Mock logger
    logger.info = jest.fn();
    logger.error = jest.fn();
    logger.warn = jest.fn();

    // Mock cloudinary
    cloudinary.uploader = {
      upload: jest.fn()
    };

    // Mock fs
    fs.readFileSync = jest.fn();
    fs.unlinkSync = jest.fn();
  });

  describe('validatePost', () => {
    const validPostData = {
      brand: 'Toyota',
      model: 'Corolla',
      description: 'Voiture en excellent état, bien entretenue',
      tags: ['berline', 'économique', 'fiable']
    };

    const mockFiles = [
      {
        originalname: 'car1.jpg',
        path: '/tmp/upload1.jpg'
      },
      {
        originalname: 'car2.jpg',
        path: '/tmp/upload2.jpg'
      }
    ];

    beforeEach(() => {
      req.body = { ...validPostData };
      req.files = [...mockFiles];

      // Mock Cloudinary upload
      cloudinary.uploader.upload.mockResolvedValue({
        secure_url: 'https://cloudinary.com/image.jpg'
      });

      // Mock fs.readFileSync
      fs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));

      // Mock fetch pour le service BDD
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, ...validPostData })
      });
    });

    describe('Validation des données d\'entrée', () => {
      it('devrait rejeter une requête sans brand', async () => {
        delete req.body.brand;

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Champs requis manquants ou images non fournies."
        });
      });

      it('devrait rejeter une requête sans model', async () => {
        delete req.body.model;

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Champs requis manquants ou images non fournies."
        });
      });

      it('devrait rejeter une requête sans description', async () => {
        delete req.body.description;

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Champs requis manquants ou images non fournies."
        });
      });

      it('devrait rejeter une requête sans tags', async () => {
        delete req.body.tags;

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Champs requis manquants ou images non fournies."
        });
      });

      it('devrait rejeter une requête sans images', async () => {
        req.files = [];

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Champs requis manquants ou images non fournies."
        });
      });

      it('devrait parser les tags depuis une string JSON', async () => {
        req.body.tags = '["berline", "économique"]';
        
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                success: true,
                acceptabilityScore: 85,
                info: "Post valide"
              })
            }
          }]
        });

        await validatePost(req, res);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
        const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
        expect(call.messages[0].content[0].text).toContain('["berline","économique"]');
      });

      it('devrait parser les tags depuis une string délimitée par des virgules', async () => {
        req.body.tags = 'berline, économique, fiable';
        
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                success: true,
                acceptabilityScore: 85,
                info: "Post valide"
              })
            }
          }]
        });

        await validatePost(req, res);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
        const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
        expect(call.messages[0].content[0].text).toContain('["berline","économique","fiable"]');
      });
    });

    describe('Upload Cloudinary', () => {
      it('devrait uploader toutes les images sur Cloudinary', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                success: true,
                acceptabilityScore: 85,
                info: "Post valide"
              })
            }
          }]
        });

        await validatePost(req, res);

        expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(2);
        expect(cloudinary.uploader.upload).toHaveBeenCalledWith('/tmp/upload1.jpg', {
          folder: "posts",
          use_filename: true,
          unique_filename: false,
          resource_type: "image"
        });
      });

      it('devrait gérer les erreurs d\'upload Cloudinary', async () => {
        cloudinary.uploader.upload.mockRejectedValue(new Error('Upload failed'));

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Erreur serveur",
          message: "Upload failed"
        });
      });
    });

    describe('Validation OpenAI', () => {
      it('devrait valider un post correct avec OpenAI', async () => {
        const mockGPTResponse = {
          success: true,
          acceptabilityScore: 85,
          info: "Post validé avec succès"
        };

        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify(mockGPTResponse)
            }
          }]
        });

        await validatePost(req, res);

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
          model: "gpt-4o",
          messages: expect.any(Array),
          max_tokens: 1200
        });

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: "Post validé avec succès",
          post: { id: 1, ...validPostData }
        });
      });

      it('devrait rejeter un post invalide selon OpenAI', async () => {
        const mockGPTResponse = {
          success: false,
          acceptabilityScore: 60,
          errors: ["Marque inconnue", "Description inappropriée"]
        };

        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify(mockGPTResponse)
            }
          }]
        });

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(mockGPTResponse);
      });

      it('devrait parser une réponse GPT avec du texte supplémentaire', async () => {
        const mockGPTResponse = {
          success: true,
          acceptabilityScore: 85,
          info: "Post validé"
        };

        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: `Voici ma réponse: ${JSON.stringify(mockGPTResponse)} et voilà.`
            }
          }]
        });

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
          success: true,
          info: "Post validé",
          post: { id: 1, ...validPostData }
        });
      });

      it('devrait gérer une réponse GPT invalide', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: "Réponse non-JSON invalide"
            }
          }]
        });

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Erreur serveur",
          message: "Réponse GPT invalide"
        });
      });

      it('devrait gérer les erreurs OpenAI', async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API Error'));

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Erreur serveur",
          message: "OpenAI API Error"
        });
      });
    });

    describe('Sauvegarde en base de données', () => {
      beforeEach(() => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                success: true,
                acceptabilityScore: 85,
                info: "Post valide"
              })
            }
          }]
        });
      });

      it('devrait sauvegarder le post validé en BDD', async () => {
        await validatePost(req, res);

        expect(global.fetch).toHaveBeenCalledWith(
          `${process.env.SERVICE_BDD_URL}/api/posts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": req.headers.authorization
            },
            body: JSON.stringify({
              brand: validPostData.brand,
              model: validPostData.model,
              description: validPostData.description,
              tags: validPostData.tags,
              images: ['https://cloudinary.com/image.jpg', 'https://cloudinary.com/image.jpg']
            })
          }
        );
      });

      it('devrait gérer les erreurs de la BDD', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          json: () => Promise.resolve({ error: 'Database error' })
        });

        await validatePost(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: "Validation réussie mais échec de l'enregistrement",
          details: { error: 'Database error' }
        });
      });
    });

    describe('Nettoyage des fichiers temporaires', () => {
      beforeEach(() => {
        mockOpenAI.chat.completions.create.mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                success: true,
                acceptabilityScore: 85,
                info: "Post valide"
              })
            }
          }]
        });
      });

      it('devrait supprimer les fichiers temporaires après traitement', async () => {
        await validatePost(req, res);

        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload1.jpg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload2.jpg');
      });

      it('devrait gérer les erreurs de suppression de fichiers', async () => {
        fs.unlinkSync.mockImplementation(() => {
          throw new Error('File deletion error');
        });

        await validatePost(req, res);

        expect(logger.warn).toHaveBeenCalledWith("Erreur suppression fichier:", expect.any(Error));
      });

      it('devrait supprimer les fichiers même en cas d\'erreur', async () => {
        mockOpenAI.chat.completions.create.mockRejectedValue(new Error('GPT Error'));

        await validatePost(req, res);

        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload1.jpg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/upload2.jpg');
      });
    });
  });

//   describe('validateData', () => {
//     const validData = {
//       username: 'user123',
//       email: 'user@example.com',
//       message: 'Ceci est un message correct'
//     };

//     beforeEach(() => {
//       req.body = { ...validData };
//     });

//     it('devrait valider des données correctes', async () => {
//       const mockGPTResponse = {
//         success: true,
//         info: "Validation des données OK"
//       };

//       mockOpenAI.chat.completions.create.mockResolvedValue({
//         choices: [{
//           message: {
//             content: JSON.stringify(mockGPTResponse)
//           }
//         }]
//       });

//       await validateData(req, res);

//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         info: "Validation des données OK"
//       });
//     });

//     it('devrait rejeter des données inappropriées', async () => {
//       const mockGPTResponse = {
//         success: false,
//         errors: [
//           "username: 'Contient des caractères inappropriés'",
//           "message: 'Contenu offensant détecté'"
//         ]
//       };

//       mockOpenAI.chat.completions.create.mockResolvedValue({
//         choices: [{
//           message: {
//             content: JSON.stringify(mockGPTResponse)
//           }
//         }]
//       });

//       await validateData(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith(mockGPTResponse);
//     });

//     it('devrait rejeter une requête sans body', async () => {
//       req.body = null;

//       await validateData(req, res);

//       expect(res.status).toHaveBeenCalledWith(400);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         error: "Aucune donnée fournie."
//       });
//     });

//     it('devrait appeler OpenAI avec les bonnes données', async () => {
//       mockOpenAI.chat.completions.create.mockResolvedValue({
//         choices: [{
//           message: {
//             content: JSON.stringify({
//               success: true,
//               info: "OK"
//             })
//           }
//         }]
//       });

//       await validateData(req, res);

//       expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
//         model: "gpt-4o",
//         messages: [{
//           role: "user",
//           content: [{
//             type: "text",
//             text: expect.stringContaining(JSON.stringify(validData))
//           }]
//         }],
//         max_tokens: 1200
//       });
//     });

//     it('devrait gérer les erreurs OpenAI dans validateData', async () => {
//       mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI Error'));

//       await validateData(req, res);

//       expect(res.status).toHaveBeenCalledWith(500);
//       expect(res.json).toHaveBeenCalledWith({
//         success: false,
//         error: "Erreur serveur",
//         message: "OpenAI Error"
//       });
//     });

//     it('devrait parser une réponse GPT avec du texte supplémentaire dans validateData', async () => {
//       const mockGPTResponse = {
//         success: true,
//         info: "Données validées"
//       };

//       mockOpenAI.chat.completions.create.mockResolvedValue({
//         choices: [{
//           message: {
//             content: `Analyse: ${JSON.stringify(mockGPTResponse)} - Fin de l'analyse.`
//           }
//         }]
//       });

//       await validateData(req, res);

//       expect(res.status).toHaveBeenCalledWith(200);
//       expect(res.json).toHaveBeenCalledWith({
//         success: true,
//         info: "Données validées"
//       });
//     });
//   });

  describe('Gestion des erreurs globales', () => {
    it('devrait logger les erreurs', async () => {
      const error = new Error('Test error');
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      req.body = { brand: 'Toyota', model: 'Corolla', description: 'Test', tags: ['test'] };
      req.files = [{ originalname: 'test.jpg', path: '/tmp/test.jpg' }];

      await validatePost(req, res);

      expect(logger.error).toHaveBeenCalledWith("Erreur dans validatePost:", error);
    });
  });
});