import jwt from 'jsonwebtoken';

const generateToken = (id,authMethod='PASSWORD') => {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not defined.');
  }
  // Signs a token with the user's ID, valid for 30 days
  return jwt.sign({ id,authMethod }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export default generateToken;
