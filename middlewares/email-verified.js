const jwt = require('jsonwebtoken');

const emailVerified = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Token manquant ou invalide.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (!decoded.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error:
          'Vous devez valider votre email pour accéder à cette fonctionnalité.',
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Token invalide ou expiré.',
    });
  }
};

module.exports = emailVerified;
