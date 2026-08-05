require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'SmartBusTrack_SuperSecret_JWT_Key_2024',
  expiresIn: process.env.JWT_EXPIRES_IN || '2h',
};
